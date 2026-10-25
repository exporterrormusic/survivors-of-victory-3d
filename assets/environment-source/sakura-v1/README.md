# Sakura blossom tree

Simple anime tree made with the existing foliage workflow: branching 3D wood plus
curved alpha-tested cards with painted blossom silhouettes. The selected texture
uses flat pink shapes and restrained cel shading. The initial detailed texture is
retained as `blossoms.png`; the selected artwork is `blossoms-anime.png`.

- Runtime model: `public/environment/sakura-v1/sakura-tree.glb` (embedded texture).
- Runtime atlas: `public/environment/sakura-v1/blossoms.webp`.
- Editable construction: `src/sakura.ts`, exported as `createSakuraTree(scene, shadows?)`.
- Interactive review: `/sakura-review.html`; drag to orbit and scroll to zoom.
- Four-angle captures and checks: `artifacts/sakura-v1/`.
- Exact selected prompt and generation mode: `prompts.json` (built-in image_gen).

The tree has two meshes/materials: wood and double-sided blossom cards. At default
scale it is about 8 metres tall with a broad spreading crown. It uses 5,544 triangles.
Curved tapered roots end below the ground plane, hiding their end caps in soil.
It is a standalone reusable model; no gameplay collisions or map placements are added.

To regenerate the model and previews, run Vite on port 5183 and
`node tools/export-sakura.mjs`. Override the base URL with `SAKURA_REVIEW_URL`.
The capture tool uses the sibling project's existing Playwright installation.
