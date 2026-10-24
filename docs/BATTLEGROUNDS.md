# Battlegrounds

Two playable layouts: **Outpost Hollow** (`?hero=snow-white&map=three-lane`) and
**Lost Outpost** (`?hero=snow-white&map=single-lane`). Select THREE LANES / ONE LANE in
Stage Select or change Battleground in F10, which starts a fresh match.

The user explicitly chose Cursed Hollow as the three-lane reference and requested HotS
defensive positions and core-health HUD placement. These are proportional traces of the
reference overviews, adapted to the prototype's unit collision sizes; they are not extracted
Blizzard map data. Cursed Hollow has left/right bases, bowed top/bottom lanes, a middle lane,
and intersecting jungle rotation paths. Lost Cavern supplies the one-lane footprint and side
pockets. `src/battleground.ts` is the shared source for terrain, paths, collision, buildings
and minimap. Preserve those relationships when editing the layout.

## Scale and defenses

The first compact blockout was rejected as too small. Travel coordinates are now **1.8×**
that blockout, without scaling heroes or buildings. Hollow's core separation is 151.9 world
units; lane lengths are approximately 209.6 / 161.1 / 210.8. Lost Outpost's lane is 139.8.
Snow White moves at 5.5 units/second: about 29 seconds along Hollow's middle lane before
obstacles/combat. Classic MOBA defaults to camera distance 32; saved camera choices remain.

Each team has, per lane, a Fort and Keep, each with two forward gate towers and a destructible
gate. There are 50 building targets on Hollow, 18 on Lost Outpost, including both Cores.
Short adjoining walls remain static. Friendly gates permit passage; enemy gates block the
attacking team's navigation until destroyed. Forts/Keeps can be attacked in any order;
the Core remains invulnerable until both the Fort and Keep **in the same lane** fall.
Buildings fire at enemies, prefer available minions when acquiring a target, and leave rubble.
Core destruction ends combat and shows Victory/Defeat with replay/lobby actions.

Twin-gun buildings emit **two projectiles per volley from transformed barrel-tip coordinates**,
including turret rotation and building scale. Each round carries half the volley damage.
The Core uses one central emitter. Range-ring scale is independent of model scale.

Six minions per side per lane spawn every 30 seconds (18 per side on Hollow, six on Lost
Outpost). They follow lane waypoints and attack structures. Hero targeting and abilities can
also damage buildings. Buildings ignore displacement and unit crowd-control effects.

Core health is a narrow strip immediately under the top-center team scoreboard: allied left,
enemy right, “Core Health” in the center. Protected Cores read INVULNERABLE; exposed Cores
show actual HP percentages. World health bars and minimap symbols reflect building destruction.

Navigation shares cover and foundations, with separate team gate blockers. Cliffs use the
same polygon as the playable boundary. Large maps use a 1.5-unit planning grid; movement
and route smoothing still sweep actual body radii. Gate destruction invalidates affected grids.

## Art status

The first structure paint-over pass is applied to both maps. Captures of the actual meshes
were painted with built-in ImageGen, then projected into surface UVs from front, back, side
and top views. Towers, Forts, Keeps, Core frames, gun heads, walls, hangars, ruins, cliffs and
wreckage now use these painted atlases. New painted paving and woodland tiles supply the
ground. Existing painted foliage remains. Team lights, forcefields and Core energy stay live.

The paint follows geometry during camera movement and gun rotation. The geometry still has
simple silhouettes, and projection seams/occluded surfaces can need further art refinement;
this is the first painted pass, not a declaration that every asset is final. See
[PAINTOVER_ART.md](PAINTOVER_ART.md) for captures, prompts, runtime files and reproduction.

Cursed Hollow tribute/curse objectives, mercenary camps, watchtower capture, regeneration
globes, healing fountains and complete ARAM rules are not implemented. The references guide
layout and defenses; this is not a full reproduction of their game modes or balance numbers.

## References

- [Blizzard Cursed Hollow overview image](https://static.heroesofthestorm.com/images/battlegrounds/maps/cursed-hollow/map-full-4513f85b74.jpg): proportional lane, compound, base and jungle positions. Saved under `artifacts/ui/battlegrounds/references/`.
- [Blizzard: Welcome to Lost Cavern](https://news.blizzard.com/en-us/article/20064917/welcome-to-lost-cavern) and [March 29, 2016 patch](https://news.blizzard.com/en-gb/article/20063493/heroes-of-the-storm-patch-notes-march-29-2016): single lane, Fort → Keep → Core progression, side corridors.
- [Lost Cavern launch overview reproduced by PC Gamer](https://cdn.mos.cms.futurecdn.net/7507a3c868f1c7054721e69d302fe280.png): traced footprint and defensive placements.
- [Blizzard's 2018 gameplay update](https://news.blizzard.com/en-us/article/21295033/2018-gameplay-update-a-more-meaningful-early-game): removed standalone rear tower; retain two forward gate towers.
- [Blizzard February 10, 2015 patch](https://news.blizzard.com/en-us/article/17906504/heroes-closed-beta-patch-notes-february-10-2015): Fort and Keep in the same lane unlock the Core.
- [Gameplay HUD screenshot](https://cdn.mos.cms.futurecdn.net/L3urJbV5NBXuQPyfmtiM5d.png): core strip beneath team levels, INVULNERABLE vs percentage, center label.
- [User's paint-over workflow reference](https://www.reddit.com/r/aigamedev/comments/1x6xh4v/finally_found_a_way_to_get_my_dream_art_style/): blockout capture, paint-over and camera projection; author discusses camera limitations.

## Verification

- `node --experimental-strip-types tools/test-navigation.mjs`: movement, crowds, concave bounds, coarse grid and destroyed-gate invalidation.
- `artifacts/check-battlegrounds.mjs`: both maps, all lane routes/body sizes/team gates, initial wave movement, hero damage, paired volley damage/origins, protection rules, percentages and victory/clock stop.
- `artifacts/check-battleground-interaction.mjs`: minion siege, rotating muzzle origins, actual mouse targeting, defeat, map switching, HUD containment at desktop/tablet/phone widths.
- `artifacts/inspect-battlegrounds.mjs`: full-map and close-up screenshots. Browser scripts use the local Vite server at port 5182 and the installed sibling project's Playwright.
- Evidence: `artifacts/ui/battlegrounds/verification.json`, `interaction-verification.json`, overview/base/defense/HUD screenshots and `artifacts/battleground-build.log`.
- Painted art: `artifacts/check-painted-art.mjs`, `artifacts/ui/paintover-v1/verification.json`, multi-angle screenshots and `artifacts/paintover-build.log`.
