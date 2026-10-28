# Stormbringer art pass: texture brief

Everything is sampled in world space (triplanar), so **every texture just needs to tile seamlessly**: no UV layouts, labels or borders. Use 1024×1024 PNG per tile unless noted. Drop the files in this folder with the names below.

Shared style line for every prompt: *stylized anime game texture, hand-painted with clean readable shapes, bright mid-values (the map is lit by storm light at night, so avoid very dark textures), soft painted shading, seamless tileable, orthographic top-down flat view, no perspective, no baked lighting gradient, no text.*

## 1. Cliff and rock (highest priority, used by cliffs, outcrops and stepping stones)

- **`rock.png`**: "Seamless tileable texture of weathered blue-grey granite and slate rock face, layered horizontal strata, angular fractures, small lichen spots, rain-darkened streaks. [shared style line]"
- **`rock-moss.png`** (optional blend layer): "Seamless tileable texture of the same blue-grey rock with patches of damp dark-green moss growing in cracks and on ledges. [shared style line]"

## 2. Ground (one per region)

- **`ground-needles.png`** (west bank): "Seamless tileable forest floor of fallen spruce needles over dark damp soil, a few small twigs and cones, muted brown-green. [shared style line]"
- **`ground-shingle.png`** (island): "Seamless tileable river shingle beach, rounded grey and blue-grey pebbles of mixed sizes, wet sheen between stones. [shared style line]"
- **`ground-slate.png`** (east bank): "Seamless tileable flat wet slate bedrock shelves seen from above, cool blue-grey plates with dark cracks and thin rain puddles. [shared style line]"
- **`ground-bank.png`** (waterline band): "Seamless tileable riverbank of wet silt and small cobbles, darker and muddier, a few water-worn stones. [shared style line]"

## 3. Downed walker (hero wreck)

The model will be original: a heavy bipedal walker lying on the shingle, cannon arm raised, one glowing red sensor eye.

- **`walker-armor.png`**: "Seamless tileable painted heavy armor plate, off-white and pale grey military paint, chipped edges, scorch marks, panel seams and small rivets. [shared style line]"
- **`walker-metal.png`**: "Seamless tileable dark gunmetal machinery surface, scratched, oily, with a little rust in recesses. [shared style line]"

## 4. Foliage (optional but strongly improves the thicket and treeline)

- **`spruce-boughs.png`**: 1024×1024 **with transparent background**. "Several dense dark spruce branch clusters on a transparent background, no snow, rain-wet needles, painted anime style, arranged to fill the square." (This replaces the current snow-dusted bough texture on this map only.)

## 5. Water (optional)

- **`water-normal.png`**: "Seamless tileable normal map of turbulent river surface ripples, flowing in one direction (top to bottom), purple-blue normal map colors."

After you add any of these, tell me which ones, and I'll wire them in and recapture.
