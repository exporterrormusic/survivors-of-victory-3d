# Ayamari Yushutsu (Aya)

Separate Sakura-derived chibi model, based on the supplied character sheet. Sakura's source `public/chibi/c282_00.glb` is unchanged.

- Editable master: `aya.blend` (packed source textures, original skeleton and actions).
- Runtime model: `../../../public/chibi/aya.glb`.
- Turnarounds and validation: `../../../artifacts/aya/`.
- Review: `/tools/review/chibi-review.html?variant=aya`.

The high collar/shirt and original hair ornaments are removed. Added geometry includes broad cat ears seated into the crown, pink interiors and irregular white tufts, a slim tapered ponytail with a continuous crimson cuff, an open gold-edged neckline, burgundy obi with a gold knot and pins, a closed indigo skirt with floral accents, and sandal straps. The lower leg/foot surfaces use skin material in place of socks. The bangs, scalp, ponytail and outer ear fur share one neutral charcoal black-grey material and lighting response. The ears use broad sloped bases embedded across the scalp, with outward triangular tips and inset white tufts. The original fuller Sakura fringe and side strands are restored, retaining the charcoal material and the approved broad cat ears. The original eye-bearing face triangles are replaced with blue-colored face geometry using the source UV shading and facial deformation weights. There is no red iris underneath an overlay. Original pupil/glint shading is retained and the red lash pigment is neutralized. Exposed skin uses an unlit peach material to match the source face's lighting response. The shoulder surface terminates at the neckline so it cannot poke through from underneath the robe. The rifle, original bangs and sleeve motifs are inherited from Sakura; this is a chibi adaptation, not an exact reproduction of the full-size illustration. The ponytail is head-weighted, without separate secondary physics.

All 15 source clips are retained. New skirt and floral vertices interpolate weights from Sakura's original garment; both complete source legs are retained and fitted beneath the kimono. Aya is registered as a Wells appearance alongside Research Uniform and Product 08. The rig uses Blender bind axes for Aya, with converted muzzle offsets in the model index. The skin follows the existing Wells character availability and alternate-skin purchase rules.

Rebuild from the repository root:

```powershell
& 'C:\Program Files\Blender 3.6.1\blender.exe' --background --factory-startup --python tools/inspect-aya.py
& 'C:\Program Files\Blender 3.6.1\blender.exe' --background --factory-startup --python tools/build-aya.py
node tools/finalize-aya.mjs
```

The finalizer restores material tint factors and the iris vertex-color unlit material omitted by Blender 3.6's exporter, validates the GLB, verifies the clip names, and registers the model. `node tools/verify-aya.mjs` checks all clips at five samples each in Babylon and captures idle/run/aim/walk poses, with Vite at port 5198. The glTF report includes the inherited non-root skinned-mesh hierarchy warnings; these are not validation errors.

The feet revision replaces the original shoe fragments with fitted bare feet, thin soles, straps and toe posts. Each assembly shares one foot bone; the lower ankle blends into that binding. `tools/verify-aya-legs.py` verifies all 170 original leg vertices remain after fitting and all eight footwear pieces use the correct foot bone. `tools/review-aya-feet.py` writes close views and a full-leg inspection with the skirt temporarily hidden.


The waist revision anchors the robe's lower edge to the pelvis, blends into the chest above the obi, and adds an inward return on the belt's upper edge. This closes the back-waist opening during torso tilts. Runtime verification also captures rear overhead idle/run/aim/reload views.





The ponytail sweep uses a continuous transported frame through the crown bend, with its root extended inside the scalp. `tools/review-aya-ponytail.py` checks closed topology and ring continuity and renders side close-ups. The fuller original bangs and side hair are restored; the approved broad ears remain.


`tools/verify-aya-talk.mjs` captures 16 poses each in talk_1, talk_2 and talk_idle, including the partial/full blink in talk_2. `artifacts/aya/eye-replacement.json` records removal of the underlying source triangles.


The illustrated selector portrait is `public/chibi/aya_portrait.png` with an icon alias at `public/chibi/aya_icon.png`. Built-in image generation prompt and references are recorded in `portrait-prompt.txt`. `tools/verify-aya-skin.mjs` checks the Wells selector, portrait loading, and head/weapon aim through standing and strafing aim/shot/reload poses.

