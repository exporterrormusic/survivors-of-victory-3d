# Stormbringer — River Fork

Key art (`public/assets/menus/stage-select/stormbringer.png`): a rocky river with rapids through dark spruce, wrecked walkers with glowing eyes, ruins on the far ridge, a lightning storm. Design bar: clean and simple like the Sakura and ice maps. Each region has one ground look, one prop family and one landmark. Few, rich hero assets. No roads, bridges or scattered buildings.

## Layout (radius 72 m)

The river enters from the north through the forest as a short **trunk** that **forks** at z = 40 into a **west** and an **east branch**. The branches run down either side at different angles and spill into a deep **lake** across the south of the map (15% wading speed even in calm water). This creates three regions:

| Region | Ground | Identity |
| --- | --- | --- |
| West bank | needle litter | one large spruce **thicket** ringed by bushes: a solid obstacle across the middle of the bank; spruce fringe at the cliff foot |
| Central island | shingle | open arena; lift arrival (4, −10); low southern tip floods in a surge |
| East bank | wet slate | bare, open; three low slate outcrops |

There are four **shoals** (rocky rapids with stepping stones): trunk z = 58, west branch z = 10 and −32, east branch z = −12. AI routes between regions over the best uncrowded shoal, using two crossings when going west ↔ east south of the fork. Edges: a thick forest border (three staggered spruce rows behind a bush hedge) on the sides and north, and the lake in the south. There are no cliffs. A continuous collision ring sits behind both. Shores fade the water in over about 1.5 m and carry a band of wet brown mud.

The channels are defined once in `storm-field.ts` (`STORM_CHANNELS`) with GLSL twins (`stormChannelGLSL`) used by the water and ground shaders. The water is a single valley-wide surface whose shader draws the union of the channels, so there are no overlapping sheets or seams. All patterns (waves, foam, current streaks) are advected downstream with two-phase blending, and the surface never dips below the ground.

## River cycle

45 s calm → 6 s warning → 10 s surge → 5 s recede.

- **Calm:** the channel wades at 48% speed and the shoals at about 84%.
- **Warning:** AI stops starting crossings and holds its own bank. Waders and units on the island's low tip head for dry ground.
- **Surge:** the whole river, shoals included, slows to **10%**, so it's almost a wall. The current pushes waders downstream and toward the nearer bank, so nobody is trapped. This splits the horde, and enemies across the river are cut off until it recedes. **There's no flood damage.**

## Code

- `storm-field.ts`: river, shoals, flood ground, speeds, current and crossing AI (renderer independent).
- `storm-layout.ts`: region boundaries and per-region placements.
- `storm-map.ts`: collision, water meshes, HUD notice, surge current.
- `storm-water.ts`: physically based river with a cel layer, shoal rapids, and a muddy surge with streaked whitecaps.
- `storm-kit.ts`: the walker wreck (graybox stand-in).
- `arena.ts`: storm ground regions using `public/environment/storm-kit-v3/` tiles (needles, shingle, slate, bank/mud).
- `range-materials.ts`: storm stepping stones and outcrops use `storm-kit-v3/rock.png`.
- `range-dressing.ts`: border, hedge and thicket foliage are batched into spatial patches (draw-call budget).

## Next (after layout sign-off)

Hero assets, to be textured by the user: cliff wall segments and the waterfall cliff, the downed walker, and a slate/boulder/stepping-stone rock set. Also the visual-only lightning on the ridge.

## Verification

```text
npm run typecheck
npm run test:storm
node tools/capture-storm-floodway.mjs   # edge-seal check + artifacts/storm-map/floodway/ (dev server on 5198)
```

`verify-storm*.mjs` belong to older layouts and need rewriting.
