# World structure options

2026-10-25 · For review · Companion to [GAME_PLAN.md](GAME_PLAN.md)

The game plan assumes separate sector maps chained into a five-sortie run. That's one choice
among many. This page lays out the alternatives so the shape of the world can be picked
deliberately.

**What stays the same in every option:** the combat, the 22-Rapture roster, the heavies and
bosses, the tell rules, the time-only Alert clock, lifts as exits you have to reach, sites
and POIs, and ability ranks. These options change how maps connect and what the game
remembers between trips.

**Two questions separate the options:**
- **Shape:** separate maps, one continuous map per run, or one world you keep coming back to.
- **What resets** when you go home: your build, the world, both or neither.

**Settled: your build never resets.** Your NIKKE levels up for good (the A02 ability ranks).
So the remaining question is whether **the world** remembers too. See "With a permanent build"
below for how that shifts the options.

---

## A. Separate maps per run

### 1. Sector sorties (the current plan)

`Ark → sector → sector → boss → sector → final`

- **Pitch:** five separate maps (160 m) per run, with a lift ride and maintenance between them.
- **A session:** a 35–40 min run, or 20 min for the 3-sortie Patrol.
- **Exploration:** see about half of each map; contents are shuffled every time.
- **Remembers:** only banked salvage and permanent upgrades.
- **Cost:** medium. Four zone maps plus three boss arenas.
- **Best at:** a tight, replayable roguelite with a scope you can finish.
  **Worst at:** each map feels like a level, with little sense of a larger surface.

### 2. Room chain ("Surface Run", your earlier candidate)

`room → choose a door → room → choose a door → boss`

- **Pitch:** a Hades-style chain of arenas. Each room is a fight plus a reward, and the door
  you pick shows what's next.
- **A session:** 20–30 min.
- **Exploration:** none. Only the choice of route.
- **Remembers:** permanent upgrades.
- **Cost:** low to medium. Small arenas.
- **Best at:** fight pacing, and it's the cheapest content.
  **Worst at:** it drops the search-and-extract idea. Small rooms also cramp a horde of hundreds.

### 3. The Descent (the lift is the level transition)

`Floor 1 ↓ lift ↓ Floor 2 ↓ lift ↓ Floor 3 … (bank and go home at any station)`

- **Pitch:** each run goes down through one huge structure, like a Rapture hive under a
  ruined city or the inside of a fallen Ark lift column. Or up, climbing a dead tower. Each floor
  is a mid-size map (80–120 m). Find the floor's working lift to go deeper. Every few floors there's a lift
  station where you can bank and go home, or press on. Deeper floors are richer and nastier, and
  bosses guard milestones. Think of Deep Rock Galactic's deep dives, Diablo's cathedral, or
  NIKKE's Tribe Tower.
- **A session:** floors take 4–6 min. Stop at any station.
- **Exploration:** every floor's lift is somewhere unknown, so "find the lift" becomes the core
  verb. Side rooms hold loot.
- **Remembers:** your deepest station becomes a shortcut start point.
- **Cost:** medium. Floors suit modular tiles and procedural assembly. It does need new
  interior art, since the current kits are outdoor.
- **Best at:** making the elevator the star, and a clean "one more floor" pull.
  **Worst at:** it leaves the surface. Weather and time of day go mostly unused underground.

## B. One continuous map per run

### 4. The Long Road

`Ark ══ road ══╦══ road ══╦══ road ══ target   (╦ = lift station)`

- **Pitch:** a run is a journey from an Ark lift to a far target across one continuous,
  streamed surface. It passes seamlessly from sakura outskirts through dead city into snow and
  storm. The road is a 150–250 m-wide band with side branches, about 1–1.5 km long, assembled
  from authored chunks. Lift stations along the way are checkpoints: maintenance, plus the
  choice to bank and leave or keep going.
- **A session:** 30–45 min for a full run; you can stop at any station.
- **Exploration:** detours off the road for loot and vistas ahead. Always new ground, never backtracking.
- **Remembers:** maybe the furthest station reached, as a start option.
- **Cost:** high. Chunk streaming, biome blending (the atmosphere system helps), lots of chunks.
- **Best at:** the feeling of a journey, and push-your-luck across the whole run.
  **Worst at:** it's linear. "Return to a lift" turns into "reach the next one".

### 5. Moving anchor (your exit is a vehicle)

`convoy ──►── stop ──►── stop ──►   (you range out and must get back aboard)`

- **Pitch:** an armoured Ark landship crosses the surface on a route. At each stop you range
  out to scavenge, and you must be back aboard before it moves on. If you miss it, it waits at the
  next stop, after a dangerous chase. This is concept M02 with the escort taken out: the
  ship protects itself and is just your ride.
- **A session:** a 30–40 min run.
- **Exploration:** around each stop, and the route keeps revealing new ground.
  Your distance from the exit keeps changing.
- **Remembers:** permanent upgrades only.
- **Cost:** high. A new vehicle asset, route streaming like the Long Road, and ship behaviour.
- **Best at:** a memorable twist, with maintenance built in (you do it on board).
  **Worst at:** a new hero asset to build, and it turns into an escort if the ship can be hurt.

### Not recommended: infinite procedural terrain

Endless generated ground around the player, like Vampire Survivors. It's cheap, but nowhere
is a place, so exploring means nothing. That's the problem we're trying to solve.

## C. A world that remembers

### 6. War map of sectors

`strategic surface map → choose a sector → sortie → the front line moves`

- **Pitch:** a strategic map of the surface, like Helldivers 2's galaxy or XCOM's globe. Regions
  are made of sector nodes. Each mission is a sector sortie from option 1. Liberating sectors
  pushes the front line, Rapture counter-offensives take ground back, and bosses sit in
  strongholds on the map.
- **A session:** one mission is 7–10 min, or chain a few.
- **Exploration:** strategic (where to push) on top of each map.
- **Remembers:** the front line, liberated sectors, unlocked lifts.
- **Cost:** medium. Option 1's maps plus a campaign layer and saving.
- **Best at:** a big-world feel for little cost, short sessions, reusing everything.
  **Worst at:** the surface between missions is a map screen, not a place.

### 7. Persistent regions (reclaim the surface piece by piece)

`region map: restored lifts ● … frontier … strongholds ▲ … boss lair ◆`

- **Pitch:** each zone is one large hand-built region (about 400–500 m, around 25 screens
  across) that remembers what you've done. Each expedition starts from any lift you've
  restored. Rapture strongholds (nest clusters guarded by a heavy) hold territory. Destroying
  one turns its area cyan: fewer spawns, Ark supply caches, relay turrets. Once enough is
  reclaimed, the boss lair opens. Raptures counterattack reclaimed ground, which gives you
  reasons to go back.
- **A session:** one expedition, 10–20 min.
- **Exploration:** the strongest short of a full open world. You map a place over many trips
  and earn shortcuts.
- **Remembers:** restored lifts, destroyed strongholds, territory, found secrets and logs.
- **Build:** permanent, like everywhere else. You keep your level and ranks, and field kits
  give the climb within an expedition.
- **Cost:** high. Big regions (authored chunks plus landmarks), streaming, saving world state,
  counterattacks.
- **Best at:** NIKKE's core fantasy (taking back the surface). Exploration, lifts and concept
  M01 Reclamation all become one system.
  **Worst at:** a lot of content per region, and fully reclaimed regions need fresh reasons to return.

### 8. Locales and hunts (Monster Hunter-style)

`Ark hub → contract board → locale → the target roams → extract`

- **Pitch:** a few rich, handmade locales (250–300 m) you revisit for different contracts:
  salvage, rescue, and above all hunting a heavy or boss that roams the whole locale. The Ark is
  a hub with a contract board. The world doesn't change, but you get to know each place deeply.
- **A session:** contracts take 8–15 min.
- **Exploration:** learning each locale well. Hunts send you across all of it.
- **Remembers:** permanent upgrades and your record against each target.
- **Cost:** medium to high. Fewer, richer maps, and bosses that roam.
- **Best at:** making bosses the star, and places that become familiar.
  **Worst at:** the same locales repeat, with less surprise.

### 9. Open world

`one seamless surface around the Ark (1–2 km), regions gated by threat`

- **Pitch:** everything connected and persistent, with day and night. Lifts become fast travel.
- **A session:** whatever you want.
- **Cost:** very high, and the biggest technical risk (streaming, saving, performance in a
  browser).
- **Best at:** the full dream.
  **Worst at:** open-world travel problems get worse at this scale. Horde pressure thins out
  when you can always walk away. **Better as a destination than a start:** option 7's regions
  can later be joined into this.

## D. Layers that sit on top

### Outpost (a home base on the surface)

NIKKE's Outpost: a base on reclaimed ground. Salvage builds facilities: a workshop (more NIPMH
capacity, if NIPMH returns; it's not in the first version), a med bay (heal between trips), a radar (reveals POIs), defence towers. Periodic
Rapture raids on the Outpost become horde-defence missions, which is your Hold the Ark
candidate. It gives salvage a use you can see instead of stat upgrades.
**Fits best with** 6, 7 and 9. Cost: medium to high.

### Day and night

Scavenge by day (low pressure), hold out by night (a horde siege at a lift, outpost or camp).
Expeditions last several days: survive N nights, then extract. It uses the existing
time-of-day and weather system, and the sun replaces the Alert clock.
**Fits** 4, 5, 7 and 9, or option 1 if each sortie is one day. Cost: low to medium on top of a structure.

---

## Side by side

| Option | Exploration feel | Session | Replayability | Content cost | Tech risk | Search and return to a lift |
| --- | --- | --- | --- | --- | --- | --- |
| 1 Sector sorties | medium | 20–40 min | high | medium | low | yes |
| 2 Room chain | none | 20–30 min | high | low | low | no |
| 3 The Descent | medium (find the lift) | 4–6 min per floor | high | medium | low | find, not return |
| 4 Long Road | high (journey) | 30–45 min | high | high | medium | reach the next station |
| 5 Moving anchor | medium-high | 30–40 min | medium-high | high | medium | yes, and it moves |
| 6 War map | medium + strategic | 7–10 min | high | medium | low | yes |
| 7 Persistent regions | high | 10–20 min | medium (needs counterattacks) | high | medium | yes |
| 8 Locales and hunts | medium-high (mastery) | 8–15 min | medium | medium-high | low | yes |
| 9 Open world | highest | any | medium | very high | high | lifts become fast travel |

## With a permanent build

Because your NIKKE keeps her level and ranks, a run is no longer the unit of progress; each
trip is. That shifts the options:

- **Stronger fit: 6 War map, 7 Persistent regions, 8 Locales and hunts, 9 Open world.** A
  character who remembers suits a world that remembers, and short trips (7–20 min) feel
  worthwhile because each one adds levels and banked loot.
- **Still fine, but changed: 1 Sector sorties, 3 Descent, 4 Long Road, 5 Moving anchor.** The
  run becomes a mission chain, not a roguelite climb from nothing. Dying ends the chain but
  costs only carried loot. They still work. Their "one more stage" pull now comes from loot
  and field kits rather than a growing build.
- **Weakest fit: 2 Room chain.** Its whole point is building up from scratch each run.

Whatever the structure, the climb within a trip has to come from what you find (field kits,
followers, turrets; see GAME_PLAN §10), since your build is already complete when you go up.

## Recommendation

**Persistent regions (7)**, built so one region grows outward from its first lift.

- It delivers what you've asked for in this order: searching the surface, getting back to
  lifts, and feeling like exploration. It's also the NIKKE premise: take the surface back.
- It matches the permanent build: your NIKKE grows and the surface she's reclaimed stays
  reclaimed. Both kinds of progress are visible.
- **It doesn't need to be built big up front.** A region can start as one 160 m patch around
  its first lift, which is the same first map the current build order makes, and gain chunks
  as content is made. The world grows with development instead of waiting for it.
- It can grow into the open world (9) later, by joining regions, and the Outpost layer slots
  in naturally once you have reclaimed ground.

**Fallbacks:** the **war map (6)** if large regions prove too expensive, since it keeps a
big-world feel on separate maps. **The Descent (3)** if you'd rather make the elevator itself
the star.

Every option shares the same first step: the enemy foundation plus one map with sites, POIs
and lifts (build order steps 1–2). Build that first, then graybox the structure you choose.

## Decisions for you

1. **Which structure?** Or pick two to graybox.
2. ~~Does your build reset each time you go up?~~ **Settled: no.** You level up for good.
   Does the **world** remember too (options 6–9), or does each run start fresh (1–5)?
3. **What session length** do you want to sit down for: 10–20 min trips, or 35–45 min runs?
