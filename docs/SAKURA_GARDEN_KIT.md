# Sakura Garden Kit

Six original, textured architectural assets replace the Sakura map's generic industrial scenery. Geometry is authored in `src/survivor/sakura-kit.ts`; the game builds and caches templates, then batches static placements by material and spatial cell.

| Asset | Design / placement |
| --- | --- |
| Roofed gate | Vermilion four-post gateway, swept tiled roof, bracket joinery and framed blank plaque. Marks the southern entrance at (0, -24). Posts stand 13.2 m apart. |
| Torii | Tapered posts, curved dark crown, hanging rope and folded paper. Shrine approach at (0, 16), plus four quarter-turned gates along the horizontal road at x = -24, -12, 12, 24 and z = -7. Horizontal gates are scaled to 1.15, giving approximately 11.4 m clear width between solid post footprints. |
| Stone lantern | Granite pedestal, lattice light chamber, stone roof and lotus finial. Restrained warm emissive paper remains visible at night. |
| Shrine | Raised stone foundation, steps, cedar walls, lattice doors, tiled roof and entry canopy, offering box and bell rope. Faces south from (0, 30), terminating the main approach. |
| Garden wall | Hand-set mossy stone blocks with ceramic tile coping. Low solid cover. |
| Garden bench | Weathered red cedar seat planks, stone feet, wooden stretcher and small metal fasteners. |

The atlas in `public/environment/sakura-kit-v1/material-atlas.png` was generated with built-in imagegen. Its full prompt is saved alongside it. Quadrants are red cedar / charcoal ceramic / mossy granite / aged cedar. UVs are inset to prevent adjacent material bleeding. Paper and brass use simple dedicated materials.

The authored plan in `src/survivor/sakura-layout.ts` preserves the central lift clearing and road vegetation clearance. Fixed pairs of lanterns lead from the entrance through the torii to a paved shrine court. Parallel stone walls enclose the court; the southern entrance is open. Paved side paths lead to two resting gardens with benches, low rear walls and surrounding groves. Tree beds contain small underplanting, with stones grouped at the outer edges. Architecture is never moved by the generic packing routine.

Only posts collide at gateways; units and low shots can pass through the centre. Shrine foundations are filled collision footprints. The northern road ends at the shrine steps; the cross-road, entrance, court approach and side gardens remain reachable. The ground shader uses the same authored paving bounds as the clearance tests and excludes road paint from Sakura. The earlier stream and moon-bridge concept remains a future terrain task.

## Review and export

Run Vite on port 5198, then open `/tools/review/sakura-kit-review.html`. The viewer includes all six assets, orbit controls and individual previews.

`node tools/export-sakura-kit.mjs` exports self-contained textured GLBs, checks that geometry and images are actually present, runs the glTF validator, saves screenshots under `artifacts/sakura-kit-v1/`, and checks the live Sakura scene for browser errors. `SAKURA_KIT_URL` overrides the dev-server URL. The script follows this repository's existing Playwright installation path.

Checks: `npm run typecheck`, `node --experimental-strip-types tools/test-range-environments.mjs`, and `node --experimental-strip-types tools/test-sakura-kit.mjs`.

`node tools/verify-sakura-layout.mjs` captures the live layout overview, shrine court, resting garden and entrance under `artifacts/sakura-layout/` and checks for browser errors.

## Player visibility

Every map now scales the fixed elevator mast to 50% in all dimensions around its footprint centre. The moving cage, shaft and boarding surface retain their working dimensions. Mast collision scales with the visual structure, and changing maps retains this compact size.

All range themes share `SceneryOcclusion`: three camera-to-player sightlines check actual scenery triangles at roughly 16 Hz. Obstructing meshes smoothly fade to 15% opacity and restore when clear. Tree foliage/trunks and mast components fade together. Shared material alpha is unchanged; explicit opaque and cutout materials support per-mesh blending while preserving foliage cutouts. Collision remains solid. Relay scenery uses the same fading.

Verification: `node --experimental-strip-types tools/test-scenery-occlusion.mjs` and `node tools/verify-scenery-occlusion.mjs`. Live screenshots and results are in `artifacts/scenery-occlusion/`.
