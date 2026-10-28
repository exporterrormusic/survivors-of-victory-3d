# Stormbringer texture set

Generated with the built-in image generation tool from TEXTURE_BRIEF.md, the Stormbringer key art, and docs/STORMBRINGER.md. No game code or material wiring was changed.

All ten textures are 1024 x 1024 PNGs for world-space repeating materials. Each has a matching `<name>.prompt.txt` containing the exact generation prompt and any subsequent revision prompts.

| File | Intended use | Approximate tile size |
| --- | --- | --- |
| `rock.png` | Blue-grey granite/slate cliffs, outcrops and stepping stones | 4 x 4 m |
| `ground-needles.png` | Brown-green spruce needle floor, west bank pinewood | 6 x 6 m |
| `ground-shingle.png` | Warmer grey rounded river pebbles, central island | 6 x 6 m |
| `ground-slate.png` | Cool blue-grey wet bedrock shelves, east bank | 6 x 6 m |
| `ground-bank.png` | Wet silt and blue-grey cobbles, waterline band | 6 x 6 m |
| `rock-moss.png` | Moss-covered rock variant for damp cracks and ledges; opaque color blend layer | 4 x 4 m |
| `walker-armor.png` | Chipped off-white/pale-grey armor of the downed walker | 2 x 2 m |
| `walker-metal.png` | Scratched oily gunmetal machinery, sparse recessed rust | 2 x 2 m |
| `spruce-boughs.png` | Rain-wet spruce clusters for thicket and treeline; actual RGBA transparency | 3 x 3 m |
| `water-normal.png` | Purple-blue tangent-space turbulent river ripple normals; top-to-bottom flow axis | 4 x 4 m |

## Export and validation

- Built-in generation returned 1254 x 1254 images. Outputs were resampled to exactly 1024 x 1024 PNG with high-quality bicubic filtering. Spruce alpha was preserved.
- Needle floor, slate and waterline bank received brightness revisions to keep the ground set in comparable mid-values while retaining distinct regional hues.
- Inspected flat surface appearance and 2 x 2 repeats. None of the ten requested textures was skipped.
- Rock received an additional generated seam-correction pass. Its strongly directional strata still make repeated boundaries discernible on close inspection; it is not certified perfectly seamless. Other tiles showed no conspicuous boundary cross at the reduced game-distance preview scale, but pixel-perfect periodicity is not guaranteed by these generated assets.
- The water map's decoded RGB normal vectors were normalized after resampling; quantized vector lengths checked at approximately 0.994 to 1.006. The generation prompt requests OpenGL +Y. Treat it as linear normal data, not sRGB color. Its physical slope consistency and final flow appearance have not been verified in-engine.
- Spruce contains genuinely transparent pixels and dense near-opaque foliage; its alpha is not a painted background.

These are saved art-pass assets with the tiling limitation above, ready for material review and in-engine recapture. No scene, shader, or material code was edited.
