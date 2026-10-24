# Geometry paint-over art

Implemented 2026-10-24 after the user rejected the flat building materials. This is the first
painted pass on the actual in-game structures, shared by both battlegrounds.

## Workflow

The [user's reference](https://www.reddit.com/r/aigamedev/comments/1x6xh4v/finally_found_a_way_to_get_my_dream_art_style/)
describes blockout capture, AI paint-over, then projection back onto geometry. Our adaptation
uses four orthographic views and bakes their projections into UVs, supporting the moving game
camera and independently rotating turrets.

1. `tools/capture-paintover.mjs` loads the local game on port 5182, clones actual geometry,
   neutralizes materials and lighting, and captures front (+Z), back (-Z), side (+X) and top
   (+Y) views. Every row is one asset, with four columns. It records exact capture centers,
   spans and available bounds in `projections.json`.
2. Built-in **image_gen** paints the capture sheets in place, preserving silhouettes and
   the grid. The armor uses ivory panels, blue-gray recesses, ochre trim, vents, painted
   bevels, wear and occlusion. Ruins/cliffs add fractured stone and moss. Ground tiles are
   separate generated paintings. No CLI/API image-generation fallback was used.
3. `python tools/export-paintover.py` encodes the selected original PNGs as WebP quality 96
   without resizing or creative image edits. It writes `assets.json` and generates
   `src/paintover-data.ts` from capture metadata.
4. `src/paintover.ts` chooses an orthographic view per triangle and bakes its projection into
   UVs. Mesh geometry is unique with independent face vertices, preventing atlas interpolation
   across unrelated views. Variable ruin/cliff/wall sizes fit the reference bounds. Shared
   textures/materials are cached per scene and atlas.

The `defenses` body and `mechanisms` gun head remain separate. Team energy materials survive
the material replacement; muzzle transforms and aiming logic are unchanged. Destroyed buildings
show separately painted rubble. Hangar walkable floors use the paving tile, keeping roof art on
the roof. The Core shield's center is almost transparent, with a subtle Fresnel rim. Daylight
intensity and bloom were reduced to avoid washing out the painting.

## Saved files and exact prompts

All source files are in [`assets/environment-source/paintover-v1/`](../assets/environment-source/paintover-v1/).
All runtime files are in [`public/environment/paintover-v1/`](../public/environment/paintover-v1/).

| Runtime texture | Painted subjects | Exact generation prompt |
| --- | --- | --- |
| `defenses.webp` | Tower, Fort and Keep chassis | [prompts.json](../assets/environment-source/paintover-v1/prompts.json) |
| `mechanisms.webp` | Twin-barrel head and Core frame | [prompts.json](../assets/environment-source/paintover-v1/prompts.json) |
| `environment.webp` | Hangar, ruin assembly, cliff | [prompts.json](../assets/environment-source/paintover-v1/prompts.json) |
| `barriers.webp` | Wall/cap and wreckage | [barrier-prompt.json](../assets/environment-source/paintover-v1/barrier-prompt.json) |
| `paving.webp` | Irregular slate/concrete with moss joints | [ground-prompts.json](../assets/environment-source/paintover-v1/ground-prompts.json) |
| `woodland.webp` | Grass, soil, roots and leaf litter | [ground-prompts.json](../assets/environment-source/paintover-v1/ground-prompts.json) |

Original images are named `*-painted.png`; unpainted captures are `*-blockout.png`.
[assets.json](../assets/environment-source/paintover-v1/assets.json) lists dimensions, sizes,
source paths and runtime paths. The six runtime files total 2,448,122 bytes. Earlier assets
were preserved. Existing painted trees/ferns/ivy and character models were retained.

To recapture one sheet, run `node tools/capture-paintover.mjs environment` (or `defenses`,
`mechanisms`, `barriers`). With no argument, it captures all sheets. The browser scripts use
the installed sibling project's Playwright; adjust their import path on another computer.
Recapturing altered geometry also requires a matching paint-over; exporting new capture
coordinates alone does not update the painted image.

## Verification and limits

`artifacts/check-painted-art.mjs` saves base/defense/Keep/Core views, three camera/turret angles,
and a destroyed Fort. It checks texture readiness, bounded finite UVs, expected painted asset
types, visible wreckage, hidden destroyed geometry and page errors. The three-lane scene had
542 individually marked painted meshes; painted cliff pieces are merged into the boundary.
Since performance pass 1 ([PERFORMANCE.md](PERFORMANCE.md)), each ruin, compound-wall pair
and hangar is baked into one static mesh after projection (UVs are unchanged; flat face normals
are recomputed after the merge). Structure meshes whose parts all map to one painted atlas
draw as a single submesh. Turret heads keep a separate visor submesh.
Screenshots and `verification.json` are in `artifacts/ui/paintover-v1/`.

The battleground and interaction checks cover both map layouts, navigation/gates, two-round
volleys from the rotated muzzle positions, siege damage, Core protection, pointer targeting,
win/loss, map switching and responsive Core HUD. The production build log is
`artifacts/paintover-build.log`.

The paint adds material depth and detail; it does not add geometric silhouette detail or real
normal/displacement maps. Four views leave some projection seams and approximated hidden or
opposite side surfaces, especially at steep angles. Further asset refinement can improve those
areas while preserving this repeatable capture/paint/bake pipeline.
