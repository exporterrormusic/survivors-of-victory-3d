# Simple anime environment kit — volume 1

26 reusable props, each exported in clean, mossy, and snowy finishes (78 GLBs).
All geometry and colors are self-contained. No external textures are required.

## Contents

| Family | Pieces |
| --- | --- |
| Rocks | Pebble cluster, round boulder, flat rock, cliff face, rock ledge |
| Walls | 2 m straight, L corner, end pillar, broken section, 4 m gate |
| Ground | Stepping stones, stairs, dirt, gravel, moss, shallow puddle |
| Plants | Grass tuft, bush, fern, reeds, fallen log |
| Cover | Wooden crate, metal barrel, concrete barrier, stacked timber, scrap pile |

The broken wall and scrap pile supply damaged silhouettes. The three finish sets
change palettes and, where applicable, add moss or snow to upper surfaces.
The puddle is a static stylized mesh, not a reflective water simulation.

## Using the assets

- Import `<asset>-<finish>.glb` into Babylon, Blender, Unity, Godot, or another glTF viewer.
- Units are metres. Place the root at the ground plane; Y is up.
- Wall straight and broken sections have endpoints at local X = -1 and +1.
- The corner has endpoints at local (-2, 0, 0) and (0, 0, 2).
- The gate has endpoints at local X = -2 and +2. It is static and closed.
- End pillars are centered on their origin. Rotate complete roots around Y.
- Stairs rise in four 0.25 m steps toward local +Z. Width and length are 2 m.
- Props do not include collision, navigation, destruction, or gameplay behavior.
- Ground patches are thin geometry; align with the receiving floor or terrain.
- Materials use broad flat colors and faceted forms; vegetation has double-sided leaves.
- Shared named materials can be deduplicated when importing many props into a level.

`manifest.json` records each file's bounds, triangle count, materials/mesh count,
finish, wall sockets, byte size, and glTF validator result.

## Editable source and preview

Source: `src/environment-kit.ts` — `createEnvironmentProp(scene, id, finish, shadows?)`.
The function returns a root TransformNode containing meshes merged by material.
Preview: `/environment-kit-review.html` on the project's Vite server. Choose a
piece, switch its finish, or select Assembly to inspect a joined wall layout.
No existing gameplay map is changed by this kit.

Re-export with `node tools/export-environment-kit.mjs` while Vite runs on port 5183.
Set `KIT_REVIEW_URL` to use another server URL. The script uses the existing sibling
NIKKE POKEMON Playwright installation, matching the project's earlier art tools.
It exports every model, validates glTF, captures the library and assembled scene,
and saves results in `artifacts/environment-kit-v1/`.
