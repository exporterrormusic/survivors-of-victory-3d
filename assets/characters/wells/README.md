# Wells — Research Uniform

Custom chibi skin derived from `public/chibi/c302_00.glb`, adapted from the user's silver-haired researcher reference.

- `wells-research.blend`: editable mesh, original skeleton and actions, six added side-bang bones.
- `wells-body.png`: retained source atlas with blue irises.
- `wells-chest.png`: dedicated emblem texture for the rebuilt, smooth undersuit torso.
- `../../../public/chibi/wells_research.glb`: runtime model with embedded textures and all 15 original animation names.
- `../../../public/chibi/wells_research_icon.png`: rendered skin-picker portrait.

The original Product 08 GLB remains unchanged. Research Uniform is Wells' default model; Product 08 is a separate alternate skin in the existing skin selector. The source legs, gloves, face, and rifle remain in use. The bulky torso and covered arms are replaced by a fitted undersuit and a continuous coat surface with shared sleeve/armhole vertices. The narrower sleeves, notched lapels, collar, cuffs and pocket welts are custom geometry. Original hair/helmet components are removed; the new bob extends to the nape with a full lower silhouette covering the scalp. Iris pigment is changed to blue while preserving the source pupil and highlights.

`Wells_Bang_L_1` through `_3` and `Wells_Bang_R_1` through `_3` form two head-parented chains. Secondary motion is authored into the clips, not a runtime physics simulation. The upper coat follows the torso and arms. Eleven pelvis-parented hem bones are driven at runtime by damped spring panels with thigh-capsule collision, neighboring-panel constraints, and teleport resets (`src/characters/wells/coat-physics.ts`). The waist stays anchored, and the pockets inherit the moving fabric weights. This lightweight simulation runs after the animation/aim rig and before skeleton rendering, including skin previews.

The hip attachments are retained at their original size, with the coat flared over them. Cyan patches sit horizontally on the outward-facing sides of the upper arms, like uniform flag patches, and inherit interpolated garment weights. The coat builder checks that its only surface openings are the combined front/neck/hem and the two cuffs; results are recorded in `artifacts/wells/coat-topology.json`.

The abdomen and hips retain the original Product 08 geometry, with an exact cut at chest height instead of deleting crossing triangles. `tools/verify-wells-torso.py` confirms all 141 original lower-torso vertices are retained exactly. The custom emblem chest overlaps that join. Covered undersuit side surfaces beneath the sleeves are masked, and the left lower armhole has additional clearance and torso-biased weights to prevent the reported dark patch.

`src/characters/wells/clock-eyes.ts` adds translucent white screen-blended clock dials with a soft emissive halo directly to the iris UVs in the game renderer and review pages. Fine rings, twelve ticks and two rotating hands fade in over 1.2 seconds and out over 1.4 seconds, within four-second appearances starting at 4, 20 and 36 seconds of a 47-second cycle. The underlying blue eyes stay intact. This is a runtime material effect, not an animation embedded in the Blender/GLB file. It applies only to `wells_research`.

Rebuild from the repository root using Blender 3.6 or compatible:

```powershell
& 'C:\Program Files\Blender 3.6.1\blender.exe' --background --factory-startup --python tools/build-wells-skin.py
```

The builder writes front, rear, and three-quarter previews to `artifacts/wells`. With Vite running on port 5198, run `node tools/verify-wells-skin.mjs` for GLB validation and Babylon animation/rig checks. The verification script uses the same local Playwright installation as the project's existing review scripts.

Review at `/tools/review/chibi-review.html?variant=wells_research` or select Wells / Research Uniform in `/tools/review/character-setup.html`.

Run `node tools/verify-wells-coat.mjs` with Vite on port 5198 to check walk/run stability at 30, 60 and 120 FPS, thigh collision contacts, normalized bone transforms, and teleport resets. Pose captures and the report are written to `artifacts/wells/coat-physics-*`.

Blender changes the derivative's bind axes: head/chest forward is local +Z and head up is +Y. `TwinStickRig` uses these axes for Wells, and `clipMuzzle` converts the inherited Product 08 Prop1 offset to `(-z, -x, y)`. Keep the source measurements in the index unchanged. The coat's hip band follows the pelvis, blending into the torso above .92 m so aimed torso twists do not pull it into the legs.

`node tools/verify-wells-gameplay.mjs` exercises the full post-animation aim correction while standing and strafing in aim, shot, and reload poses. It checks head leveling, barrel alignment, and rendered hip-band/hem clearance, and writes `artifacts/wells/gameplay-validation.json`.

That gameplay check also installs the toon and invincibility-hologram plugins. The eye-clock plugin must retain its explicit `WELLS_CLOCK_EYES` shader define: without it, the rifle can reuse the face's compiled shader with a mismatched uniform-buffer layout, disappearing from the camera while still casting a shadow. The test checks shader separation and GPU buffer errors.
