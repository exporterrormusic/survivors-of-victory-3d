# Storm kit v2 — texture brief

Replace `material-atlas.png` in this folder (current file is a placeholder assembled from v1 + Grey Ruins asphalt).

**Format:** one 2048×2048 PNG, split into four 1024×1024 quadrants. Each quadrant must tile seamlessly on its own (left↔right, top↔bottom). The game samples each quadrant in world space (triplanar), so there are no UV islands to paint — just four tileable surfaces. Keep ~12 px of safe margin inside each quadrant edge; no labels, text, or borders.

| Quadrant | Surface | World scale | Used on |
| --- | --- | --- | --- |
| Top-left | Weathered highway concrete | 1 tile ≈ 3.3 m | bridge deck, jersey barriers, piers, pump station walls, footings |
| Top-right | Cracked wet asphalt (no paint) | 1 tile ≈ 4.5 m | bridge and causeway road surface |
| Bottom-left | Painted steel, blue-grey, chipped | 1 tile ≈ 2.2 m | trestle truss, gantries, lamp poles, guardrails, mech hull |
| Bottom-right | Heavy rust / corroded sheet metal | 1 tile ≈ 2.5 m | wrecked cars and truck, sleepers, mech armor, tank |

Lane paint, signs, lamps and warning lights are flat colours in code; don't paint them in.

## Prompts (one per quadrant, then assemble — or ask for the 2×2 sheet directly)

Shared style line: *stylized anime game texture, hand-painted look with clean readable shapes, bright mid-values (the game is lit at night by storm light, so avoid very dark textures), soft painted shading, seamless tileable, orthographic top-down flat view, no perspective, no lighting gradient, no text.*

1. **Concrete** — "Seamless tileable texture of weathered rain-soaked highway concrete, faint form-work seams, hairline cracks, small aggregate speckles, subtle water staining streaks and a little moss in cracks, cool light grey. [shared style line]"
2. **Asphalt** — "Seamless tileable texture of old wet asphalt road surface, dark blue-grey with lighter worn aggregate, a few patched repairs and branching cracks, small puddle sheen spots, no road markings. [shared style line]"
3. **Painted steel** — "Seamless tileable texture of industrial steel plate painted muted blue-grey, chipped paint edges revealing darker metal, a few rivet rows and faint rust bleed streaks. [shared style line]"
4. **Rust** — "Seamless tileable texture of heavily rusted corroded sheet metal, orange-brown rust with flaking dark patches and remnants of faded white paint, pitted surface. [shared style line]"

Single-sheet alternative: "A 2×2 texture atlas, four equal seamless tileable squares with no gaps or borders: top-left weathered highway concrete, top-right wet cracked asphalt without markings, bottom-left chipped blue-grey painted steel, bottom-right heavy orange-brown rust. [shared style line]"

After dropping in the new file, reload `/?run=test-range&environment=storm` and run `node tools/capture-storm-floodway.mjs`.
