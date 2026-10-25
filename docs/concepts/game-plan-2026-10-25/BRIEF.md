# Art brief: visualizing the Survivors of Victory 3D game plan

2026-10-25 · For an image-generation assistant · Source design: [docs/GAME_PLAN.md](../../GAME_PLAN.md)
and [docs/WORLD_OPTIONS.md](../../WORLD_OPTIONS.md)

## Your task

Produce **concept mockups of gameplay screens and menus** for a game that has not been built
yet, so the designer can see the plan and judge it. These are not marketing posters. Every
image should look like a believable frame from the finished game, and every image has one
design point it must make obvious (listed as **Must show** for each shot).

- Work through the shots in **priority order**: all P1 first, then P2, then P3.
- **One image per shot ID.** Size 1920 × 1080 (16:9). Shots marked *+21:9* also get a
  2560 × 1080 version. **Landscape only.** Never portrait or phone layouts.
- Save each as `<ID>-<short-slug>.png` in this folder (e.g. `S01-lift-up.png`), and record
  the exact prompt you used for each in `prompts.json`.
- **Don't redesign.** If something in a shot can't be drawn as described, draw the closest
  faithful version and note the difference in `prompts.json`. Don't add mechanics,
  characters, enemies or UI that aren't described.
- After finishing, make a simple local `index.html` gallery grouped by section, showing each
  image with its ID, title and its **Must show** line, so the designer can review them in order.

## The game in one paragraph (context)

A single-player 3D action "survivors" game in the NIKKE universe, played from a fixed
top-down three-quarter camera. You control one chibi NIKKE, **Snow White**, with WASD,
always aiming at the mouse cursor and firing a piercing sniper "lance" of cold blue fire
through hordes of up to hundreds of machine enemies called **Raptures**. You ride an
industrial **lift** up from the underground Ark city onto the overgrown ruined surface, search
ruined sites for supplies while the horde keeps coming, do one job, then **fight your way
back to a lift** to escape: either the one you arrived on, or an old dormant lift tower you
restored on the way. A time-based **Alert** level (1–5) makes things more dangerous the longer
you stay. Your character levels up permanently. Big Raptures appear as mini-bosses
("heavies") and bosses.

## Reference images (attach these to your generations)

All are in [`references/`](references/).

| File | Use it for |
| --- | --- |
| `approved-hud.jpg` | **The HUD.** Copy its layout, panel shapes, thin lines, corner cuts, fonts and colours exactly. Also the camera angle and how small Snow White is on screen |
| `current-game-dusk.jpg`, `current-game-night-storm.jpg`, `current-game-snow.jpg` | The real in-game render style today: toon-shaded chibi, dark ink outlines, painted ground. Also the compact music player at top right, left of Pause |
| `illustrated-detail-level.jpg` | The **level of environmental detail and atmosphere** the designer likes: dense overgrown ruins, props, lighting. **Do not copy its enemies (generic spiders, wrong) or its HUD (an outdated hex dock)** |
| `menu-style.jpg` | Style for **full-screen menus and map screens**: dark navy/charcoal panels, thin cyan lines, gold highlights, illustrated vignettes, bold condensed uppercase type |
| `enemy-roster.jpg` | All 22 Raptures with their names and roles, at a glance |
| `raptures/<name>-<id>.jpg` | **The exact look of each Rapture.** Each render includes a mass-produced Nikke soldier for scale. Use these whenever a shot names a Rapture |
| `snow-white-rifle.png`, `snow-white-turret.png`, `snow-white-burst-art.jpg` | Snow White's rifle, her deployable turret, and her Burst card artwork (golden eye close-up) |

## Style rules (apply to every shot)

### Rendering

- A stylized 3D game frame: **NIKKE SD chibi** characters with toon shading and dark ink
  outlines, on **painted, richly detailed environments**. Combine the render style of the
  `current-game-*` captures with the environmental density of `illustrated-detail-level.jpg`.
- The surface is a **modern city and countryside reclaimed by nature**: cracked asphalt with
  faded road markings, overgrown concrete, collapsed buildings, abandoned military vehicles and
  crates, trees pushing through ruins. NIKKE's post-apocalyptic surface.

### Camera (all gameplay shots unless a shot says otherwise)

- **Fixed top-down three-quarter perspective,** about 45° down, north always up, no rotation.
  It is a perspective camera, not isometric.
- Snow White near the centre of the frame, a little low. Visible ground at her position is
  about **19 m wide and 18 m deep**; she is roughly **1/9 to 1/6 of the frame height**. Follow
  `approved-hud.jpg` for scale.
- Because the camera looks down, distant tall landmarks are usually **off screen**. Show them
  through HUD edge markers (described below) rather than on a horizon. Only shots marked
  *cinematic* may pull the camera back and lower to show a skyline.

### Characters

- **Snow White** (the player): chibi, long white hair, white-and-black hooded coat, dark visor
  goggles on her head, golden eyes, a long white sniper rifle with orange/gold accents (see
  `snow-white-rifle.png`). From the gameplay camera you mostly see her from above and behind:
  hood, white hair, rifle. She always faces the cursor and aims her rifle at it.
- Her attacks are **cold blue/cyan fire with a white core**:
  - Main shot: a long straight streak of blue fire that pierces every enemy in a line, with
    small cyan sparks at each hit.
  - Special: a white auto-turret (`snow-white-turret.png`) that launches cyan homing missiles.
  - Burst: a huge cold-blue cone blast.
  - Dash: a short burst of speed that leaves a faint cyan afterimage.
- **Mass-produced Nikkes** (rescued followers): chibi soldiers with dark helmets and goggles,
  grey/black uniforms, pink hair, small rifles. See the soldier in any Rapture render. They are
  never the player.
- **No other named NIKKE heroes** appear.

### Raptures (enemies)

- Use the renders in `references/raptures/` **exactly**: dark gunmetal and charcoal machines
  (Phalanx is red, Solaris carries a gold box) with **red or yellow glowing eye lights**.
  Never draw generic spiders, insects or invented robots.
- **Size reads as threat**, relative to Snow White: horde ≈ her height; specialists 1.2–1.6×;
  heavies 2.5–3.5×; bosses 5× and up; the final boss Sinister fills a large part of the frame.
- Enemies get only a **thin red health bar** overhead, with no names or text. Heavies get a
  thicker, armoured bar. Snow White has a small segmented green bar.

### Colour language (critical, so keep it consistent)

| Colour / shape | Means |
| --- | --- |
| **Cold blue / cyan fire** | Snow White's attacks |
| **Cyan** rings, lights, icons | Friendly or interactive: lifts, restored towers, relays, turrets, the ring around a searchable site |
| **Red ground decal that fills up** (circle or strip; a pale outline filling with solid red) | An area attack lands here when full |
| **Thin red laser line** ending on Snow White | An aimed shot locking on. It turns **white** just before firing |
| **Orange lane with chevrons** painted on the ground | A charge, leap or strafing run will travel this path |
| **Yellow flare** on an enemy's eyes or gun muzzles | About to fire |
| **Purple** pools, rings, tints | Status zones (slow, jamming) |
| **Hot red / orange / magenta orbs** with bright cores | Enemy projectiles (slow, easy to read) |
| **Gold** | Burst, progress, and the gold rim of a "Hunter" elite |

### HUD (gameplay shots)

Copy `approved-hud.jpg`. The elements, in place:
- **Top left:** objective panel with a small square marker, a title and one subtitle line.
- **Top centre:** large timer, with a label line under it. The plan replaces "WAVE 01" with
  **ALERT** and five small pips (lit pips amber, turning red at 4–5).
- **Top right:** a compact music player, then the Pause button with ESC under it. Omit the
  "WEATHER LAB" button; it's a developer tool.
- **Bottom left:** portrait card, "PILGRIM" / "SNOW WHITE", mint health bar with "HP / 50",
  cream cartridge pips with "07 / 07" and an R key.
- **Bottom centre:** DASH (SHIFT), WEAPON (LMB) and SPECIAL (RMB, with a count) cards, then
  the wide gold-trimmed **BURST** card with her golden-eye art, "SEVEN DWARVES" and a percentage.
- **Bottom right:** square RADAR.
- **Along the bottom:** "LV nn", a thin gold XP line, and "[TAB] UPGRADES" with a gold count box.

New HUD elements this plan adds (use them where a shot lists them):
- **Field kits row:** up to six small square icons with ×counts, sitting just above the
  portrait panel. The six kit icons are a magazine with a plus, a bullet with a flame, a
  crosshair on a microchip, a hand with a circular arrow, a small turret with a plus, and a
  gold battery cell.
- **Carried salvage:** a line under the objective subtitle, e.g. "◆ 23 CARRIED".
- **Edge markers:** small icons pinned to the screen edge pointing at off-screen things: a cyan
  diamond with a distance for exits ("LIFT 58 m"), a red chevron for a sniper, a gold chevron
  for the Hunter.
- **Radar contents:** red dots for enemies, cyan lift icons, grey tower icons for unrestored
  lift towers, yellow diamonds for searchable sites.

### Text in images

Short uppercase letter-spaced labels like the HUD. Use the exact strings given in each shot.
No paragraphs except inside menu panels that call for them. Numbers should look plausible.

### Never include

Portrait or vertical layouts · names or status words over enemies or characters · XP gems or
orbs on the ground · "choose 1 of 3" level-up cards · other playable heroes · generic
spider/insect enemies · the old hexagonal button dock · watermarks or signatures.

### Recurring objects

- **Arrival lift:** a square industrial platform about 6 × 6 m set into the ground, with
  yellow-black hazard stripes on the edge, a waist-high steel frame with two sliding
  chevron-striped gates, amber warning lamps and cyan guide lights along the platform edge.
- **Dormant lift tower:** a tall weathered tower (steel lattice and concrete, 4–6 m wide at
  the base, rising out of frame) with a lift cage at its foot. Dark and rusted when dormant.
  When restored, cyan light bars run up it, its platform lights cyan and a beacon glows.
- **Searchable site ring:** a cyan circle on the ground (about 3 m radius) around the object,
  with a cyan progress arc filling clockwise.
- **Supply cache:** a battered military crate with a cyan Ark marking. A **priority crate**
  (job objective) is larger with gold markings.
- **Field kit pickup:** a small hexagonal canister on the ground with a soft gold glow,
  showing its kit icon.
- **Rapture nest:** a low spiky dark-metal mound with red glowing vents, in a patch of red haze.

---

## Shot list

38 shots. **P1 = generate first** (11 shots: S01, S02, S03, S05, S07, E01, B01, B05, W01,
W03, W04). P2 = second pass (22). P3 = if time allows (5).

### S — One sortie, start to finish (zone: Ark Outskirts, a sakura-overgrown ruined district)

#### S01 · Lift up · P1 · +21:9 · *cinematic*
- **Must show:** you arrive on a lift that rises out of a shaft. That lift is your guaranteed
  way home. The district is big, with old lift towers on the skyline.
- **Scene:** day, drifting sakura petals. The camera is pulled back and a little lower than
  gameplay. Snow White stands on the arrival lift, which has just risen flush with a ruined
  plaza; its two gates are sliding open, amber lamps blinking, cyan edge lights on. Around the
  plaza: overgrown concrete, sakura trees, broken lamp posts, an abandoned truck. In the hazy
  distance, two or three tall **dormant lift towers** stand dark against the sky.
- **Raptures:** none close; two or three Lures far up the road just appearing.
- **HUD:** fading in. Objective: "ARK OUTSKIRTS" / "SALVAGE RUN · CRATES 0/4". Top centre:
  "00:04" with "ALERT" and 1 of 5 pips lit.

#### S02 · Working a site · P1 · *the HUD reference shot*
- **Must show:** you search a site by **standing in its cyan ring while still fighting**
  (no button). The horde is always around. Finds include field kits. It also shows the full
  in-sortie HUD with all new elements.
- **Scene:** mid-sortie, day. A small site around an overturned Ark supply truck spilling
  crates. Snow White stands inside a cyan ring around a supply cache; the progress arc is about
  70% full. She fires her blue lance to the right through a line of five Lures, piercing all of
  them. At upper left a Crawler's two cannons glow yellow; two slow orange-red bolts from a
  second Crawler are in the air. A field-kit canister glows gold beside an opened crate.
- **Raptures:** Lure ×8, Crawler ×2.
- **HUD:**
  - Objective: "ARK OUTSKIRTS" / "SALVAGE RUN · CRATES 1/4" / "◆ 7 CARRIED".
  - Top centre: "02:41", "ALERT" with 2 of 5 pips lit.
  - Field kits row: magazine ×2, flame bullet ×1, crosshair chip ×1.
  - Edge marker at the top-right edge: cyan diamond "LIFT 58 m".
  - Radar: red dots, a cyan lift, two grey towers, yellow diamonds.
  - "LV 07"; Burst card "BURST 64%"; "[TAB] UPGRADES 1".

#### S03 · Sector map · P1
- **Must show:** the sector is big (160 m, about 8 screens across) and built from distinct
  sites. You chart it as you go. The arrival lift is near one edge, with dormant towers spread
  across the map. You won't reach everything.
- **Scene:** the game is paused with a full-screen map overlay in `menu-style.jpg` style; the
  battlefield is dimmed behind it.
  - **The map:** a painted top-down map of a square district: ruined blocks, roads, a river,
    sakura groves.
  - **Charted area:** about the lower-left 40% is fully drawn, with a dotted trail looping
    from the arrival lift through three sites to Snow White's head icon.
  - **Uncharted area:** the rest is dark fog with faint outlines. Visible through the fog:
    four tower icons (one cyan = restored, three grey), two smoke-column icons (wrecks), two red
    haze icons (nests), and three gold crate icons (job crates, one ticked).
  - **Site labels:** "CONVOY WRECK", "OLD STATION", "NEST GARDEN", "SCHOOL RUINS",
    "FUEL DEPOT", "LIFT TOWER 2".
  - **Other map marks:** a cyan "ARRIVAL LIFT" on the bottom edge, a faint 20 m grid, and a
    scale bar "50 m".
- **Panels:**
  - Legend at right: SUPPLY CACHE · WRECK · LIFT TOWER · RAPTURE NEST · STRANDED NIKKE ·
    TERMINAL · PRIORITY CRATE.
  - Header: "ARK OUTSKIRTS · SALVAGE RUN 1/4" and "ALERT" with 2 pips · "02:41".
  - Footer: "[M] CLOSE".

#### S04 · Restoring a lift tower · P2
- **Must show:** a dormant tower is restored by standing in its ring (8 s), giving a second,
  closer exit.
- **Scene:** dusk, warm orange light. The base of a tall dormant tower rising out of frame.
  The cyan ring around its base is 60% full, and cyan light bars are switching on up the tower
  from the bottom. Snow White inside the ring, turning to shoot. Three Pelicans each have an
  orange chevron lane on the ground pointing at her; one is mid-leap.
- **Raptures:** Pelican ×3, Lure ×6.
- **HUD:** objective "RESTORING LIFT TOWER" / "5 s"; "ALERT" with 3 pips; "05:02".

#### S05 · Heading home · P1 · +21:9
- **Must show:** the climax is **fighting your way back to an exit**. Distance is the risk,
  the horde converges, a heavy stands in the way, and off-screen threats are marked.
- **Scene:** early night. Snow White runs north-east toward a **restored cyan lift tower** at
  the upper right (lit platform, beacon), about 25 m away. A dense horde of 60–100 converges
  from left, right and behind:
  - Lures, Crawlers and Pelicans.
  - A Capra charging along a long orange lane.
  - Two Solaris, each with an expanding red ring.
  - Between her and the lift, a **Hard Hat** (large hovering dome) with its front hatch opening.
  - A Seahorse's thin red sniper line enters from the right edge.
  - Behind her, her white turret fires cyan missiles. Her lance pierces a column of Lures.
- **Raptures:** Lure, Crawler, Pelican, Capra, Solaris, Hard Hat (Seahorse off screen).
- **HUD:**
  - Objective: "SALVAGE RUN COMPLETE" / "GET TO A LIFT" / "◆ 23 CARRIED" with a small
    warning triangle.
  - Top centre: "06:12", "ALERT" with 5 red pips and the word "HUNTED".
  - Health 22 / 50.
  - Edge markers: red chevron at the right edge; gold chevron at the lower-left edge
    "HUNTER 40 m".
  - Radar: a red ring of dots closing in, and "EXIT 24 m".
  - Field kits row: all six kinds, ×1–×2.

#### S06 · Boarding · P2
- **Must show:** you board by **holding the platform while the gates cycle** (8 s) as the
  horde presses in.
- **Scene:** night. Snow White on the restored tower's lit platform, the two chevron gates half
  closed. A cyan countdown ring is drawn around the platform. A rescued mass-produced Nikke
  stands beside her, firing. Raptures crowd the platform edge, and a Pelican leaps at the
  closing gap in a burst of sparks.
- **Raptures:** Lure, Pelican, Crawler.
- **HUD:** top centre replaced by "GATES CLOSING" with a large "03"; objective "EXTRACTING".

#### S07 · Extraction results · P1
- **Must show:** what you bank, permanent XP and levels, field kits ending with the trip, and
  the job paying out on extraction.
- **Scene:** a full-screen results panel in `menu-style.jpg` style over a dim lift-interior
  background: shaft walls streaking past, hazard stripes, cyan lights, and Snow White's chibi
  standing relaxed at the left.
- **Panel:**
  - Header: "SECTOR CLEARED · ARK OUTSKIRTS".
  - **BANKED:** "SALVAGE ◆ 23 → CORE DUST 23", "CREDITS 640", one module card "ECHO
    CHAMBER", "PRISTINE CORE ×1".
  - **JOB:** "SALVAGE RUN 4/4 ✓ +300".
  - **SNOW WHITE:** "LV 07 → LV 09", a filling XP bar, "+2 SP".
  - **TRIP:** "TIME 06:48 · KILLS 612 · ALERT 5 · NIKKES RESCUED 1".
  - **FIELD KITS:** the six kit icons greyed out, "FIELD KITS LAST ONE TRIP".
  - Button: "CONTINUE".

#### S08 · The Hunter · P2
- **Must show:** at Alert 5 a **Hunter**, a gold-rimmed oversized heavy, tracks you. You can
  kite it or kill it.
- **Scene:** zone Frozen North, night, falling snow, snowbanks and pines. A **Thermite** drawn
  1.4× larger than normal, with a **gold rim light**, gold-tinted eye lights and a thick
  gold-trimmed armoured health bar. It strides after Snow White spraying a flame cone, leaving
  burning patches on the snow. Snow White backpedals while firing. Footprints in the snow.
- **HUD:** "ALERT" with 5 red pips · "HUNTED"; a banner under the timer:
  "A HUNTER IS TRACKING YOU".

### E — Enemy tells

#### E01 · The horde · P1
- **Must show:** the horde roles read instantly: a swarm, a gun line behind a shield, pounce
  lanes, an exploder's ring. The shield **blocks even the piercing lance**.
- **Scene:** Ark Outskirts, day, an open plaza. Snow White at lower centre.
  - **Ahead:** a **Phalanx** (red crab-like body with two crescent claws) glides forward,
    projecting a curved, translucent red-orange energy wall in a 120° arc in front of it.
    Behind the wall, four **Crawlers** in a row, cannons glowing yellow. Snow White's blue
    lance hits the wall and **stops there** in a splash.
  - **Left:** a flock of about 12 **Lures** streaming at her.
  - **Right:** three **Pelicans** crouched, each with an orange chevron lane pointing at her,
    one mid-leap.
  - **Lower right:** a **Solaris** (biped holding a gold box overhead) planted, with a red
    ring on the ground around it half filled. Several Lures are inside the ring (it will hit
    them too).
- **HUD:** standard, "ALERT" with 2 pips.

#### E02 · Called shots · P2
- **Must show:** a spotter's laser, a sniper's line turning white, and mortar circles
  predicting your movement.
- **Scene:** zone Dead City: a street between tall ruined buildings, rubble.
  - A **Cube** (camera-headed quadruped) at upper left on a rubble heap paints Snow White with
    a thin red laser.
  - A **Seahorse** floats at the top-right edge; its line across the screen to her is **white**
    (about to fire).
  - Three red filling circles on the ground: one under Snow White and two ahead of her along
    her running direction. Three shells are visible arcing in from an off-screen **Tripod**.
  - Snow White dashes sideways toward a low wall (cyan afterimage).
- **HUD:** "ALERT" with 3 pips; red edge chevron at the top-right.

#### E03 · From above · P2
- **Must show:** flying threats telegraph on the ground.
- **Scene:** zone Frozen North, snowfield.
  - A **Hanged Man** (blade-shaped flyer) high above, with a locked red circle filling on the
    snow under Snow White and its shadow ring.
  - A **Penetrator** (saucer gunship) starting a strafing run, with a long orange 2.5 m-wide
    lane crossing the screen diagonally through her position.
  - A **Twin Tail** (spider with two big tail cannons) at right, showing two parallel yellow
    lines as it charges twin beams.
  - Snow White mid-dash out of the circle.

#### E04 · Area control · P2
- **Must show:** turrets, bullet spirals and jamming pools shape where you can stand.
- **Scene:** zone Stormbringer, night rain, wet reflective ground.
  - A **Sentry** deployed (dome raised, legs planted) sweeping a stream of red bolts.
  - A **Tail Bone** anchored and spinning, throwing a three-arm spiral of slow magenta orbs.
  - A **Squid** floating at the back with a purple aura ring around it, lobbing a purple glob
    toward a landing circle. Two purple pools already on the ground.
  - A yellow lightning-strike circle nearby (zone hazard).
  - Snow White stepping between the pools.

#### E05 · Tell language plate · P2 · *not a game screen*
- **Must show:** the six warning signals as a clean legend.
- **Scene:** a dark charcoal presentation board in `menu-style.jpg` style. Six tiles, each a
  small in-game crop:
  - red filling circle: "AREA HIT INCOMING"
  - thin red laser line, then the same line white: "AIMED SHOT · WHITE = FIRING"
  - orange chevron lane: "CHARGE PATH"
  - a Crawler with yellow muzzle flares: "ABOUT TO FIRE"
  - purple pool: "STATUS ZONE"
  - cyan ring around a crate: "FRIENDLY / SEARCH HERE"

#### E06 · Bestiary · P3
- **Must show:** all 22 Raptures organized by tier, with their roles.
- **Scene:** full-screen menu "RECORDS · BESTIARY" in `menu-style.jpg` style. Four rows of
  cards (HORDE · SPECIALIST · HEAVY · BOSS). Each card has the render, name, role and a small
  tell icon. Use the exact names and roles from `enemy-roster.jpg`. The selected card,
  **PHALANX**, is enlarged at the right: "SHIELDER · A frontal wall blocks every shot, even
  piercing ones. Flank it."

### H — Heavies (mini-bosses, 2.5–3.5× Snow White's height)

#### H01 · Hard Hat: hatch open · P2
- **Must show:** a heavy's **punish window**. The armoured carrier is only vulnerable while
  its hatch is open.
- **Scene:** Ark Outskirts. A **Hard Hat** (huge hovering dome) with its front hatch open, red
  glow inside, Lures and two Pelicans tumbling out. Snow White fires into the hatch; large
  gold damage numbers show double damage. Thick armoured overhead bar.

#### H02 · Thermite: flame sweep · P2
- **Must show:** a cone attack, plus burning ground that channels the horde.
- **Scene:** Frozen North. A **Thermite** sweeps a 60° cone of orange-white flame from its
  four lamp pods. Snow White stays just outside the cone's edge. A line of three burning
  patches on the snow is burning Lures caught in it.

#### H03 · Cucumber: missiles shot down · P2
- **Must show:** homing missiles can be shot down, and one piercing shot clears several.
- **Scene:** Dead City. Six slow homing missiles with smoke trails curve toward Snow White.
  Her single blue lance passes through three of them, which burst. A 4 × 20 m red strip on the
  ground fills toward her (carpet bombing). The **Cucumber** stands at the top with its red eye
  pods glowing.

#### H04 · Loud Mouth: shockwave · P2
- **Must show:** an expanding ring you **dash through**, and a howl that empowers nearby
  Raptures.
- **Scene:** Stormbringer, night rain. A translucent, knee-high distortion ring expands from
  **Loud Mouth**'s speaker grid. Snow White dashes through it, leaving a cyan afterimage.
  Surrounding Lures and Crawlers have red-glowing eyes (rallied).

### B — Bosses (5× Snow White's height and up)

#### B01 · Obelisk, phase 2 "Unfold" · P1
- **Must show:** the boss's armour pieces **orbit as moving shields**: shoot through the gaps,
  and the pieces can be broken off.
- **Scene:** an arena plaza around "Old Lift No. 4" (a huge derelict lift structure at the
  north side as backdrop), with four broken pillars.
  - The **Obelisk** floats at the centre: a glowing core, its two hex-armoured shell halves
    detached and orbiting at a distance. One shell shows cracks.
  - Two sustained red beams from the core rotate, with a faint arc showing the sweep.
  - One shell flies outward along an orange lane (boomerang).
  - Snow White at lower left fires a lance through the gap between the shells into the core.
  - Adds: Pelicans.
- **HUD:** the ALERT area is replaced by a boss bar: "OBELISK" over a long bar with two tick
  marks at 66% and 33%, currently about 55%.

#### B02 · Obelisk, phase 3 "Overload" · P3
- **Scene:** the core is now red. Four pylons around the arena beam red lines into it, and a
  shield bubble surrounds the core. Snow White lines up two pylons for one piercing shot.

#### B03 · Cocytus overflight · P2
- **Must show:** a flying boss telegraphs its pass with its shadow and a lane.
- **Scene:** a frozen lake at dusk with snow. **Cocytus** (a whale-like flying Rapture with
  red fins) passes overhead; its huge shadow and a frost lane lie on the ice ahead of it, with
  a trail of frost-bomb circles behind. Hanged Men dive. Snow White has frost crystals on her
  coat (the Chill status, shown as VFX only).

#### B04 · Cocytus breach · P2
- **Scene:** Cocytus bursts up through the ice in a spray of ice shards and water. Dark
  open-water holes elsewhere on the lake show the arena shrinking. Its red fins glow as weak
  points. Boss bar "COCYTUS" with two ticks.

#### B05 · Sinister standoff · P1 · +21:9
- **Must show:** the final boss is a **huge airship made of breakable parts**. Its main cannon
  sweeps the whole arena, so you take cover.
- **Scene:** "The Hollow", a crater at night with ash falling.
  - **Sinister** (17 m winged airship with a tall spire cannon; see its render) hovers along
    the top edge, wings spanning much of the frame.
  - The spire glows as it charges, and a 4 m-wide red lane crosses the entire arena.
  - Snow White hides behind one of three concrete cover blocks.
  - Missile swarms rise from the wing batteries, and the belly hangar is open, dropping
    Hanged Men.
- **HUD:** boss bar "SINISTER", with a parts list under it: "WING BATTERY L" (bar),
  "WING BATTERY R" (crossed out, destroyed), "HANGAR" (bar), "SPIRE CANNON" (bar).

#### B06 · Sinister crash and escape · P2
- **Scene:** Sinister has crashed into the crater, burning. Red debris circles fall behind
  Snow White as she sprints toward a cyan-lit lift at the base of a fallen Ark lift column
  (upper right), through the horde. Objective: "CRATER COLLAPSING" / "GET TO THE LIFT".

### Z — Zones (gameplay camera, establishing the look of each place)

The S shots establish Ark Outskirts.

#### Z02 · The Frozen North: whiteout · P2
- **Scene:** a snowfield with banks and footprints, pines, the edge of a frozen lake. A
  whiteout pulse reduces visibility to a white haze, but enemy **red eyes and red ground
  circles still show through**.

#### Z03 · Dead City · P2
- **Scene:** tight streets between ruined buildings. One building between the camera and Snow
  White is drawn **semi-transparent** (cut-away), so she stays visible. A shot fuel truck
  explodes among Raptures. A Sentry is deployed on a corner.

#### Z04 · Stormbringer · P2
- **Scene:** night rainforest ruins in heavy rain, wet reflective ground. A lightning strike
  lands on a yellow circle among a group of Raptures. A Loud Mouth silhouette is in the background.

#### Z05 · The Hollow · P3 · *cinematic*
- **Scene:** a crater rim at night, ash in the air, a fallen Ark lift column, a red glow on
  the clouds, and Sinister's silhouette far away.

### W — World structure options (the designer hasn't chosen yet; show each clearly)

#### W01 · Persistent regions: region map · P1
- **Must show:** one large region that **remembers** your progress. Restored lifts are your
  starting points, reclaimed ground is cyan, Rapture strongholds hold red ground, and the boss
  lair opens once enough is reclaimed.
- **Scene:** a full-screen region map in `menu-style.jpg` style titled
  "ARK OUTSKIRTS · REGION". A painted map about 5× the size of a sector:
  - **Reclaimed territory** in cyan around three restored lift icons.
  - **Red-held territory** with four stronghold icons (red triangles with heavy silhouettes).
    One stronghold is crossed out and its area has turned cyan.
  - **Frontier:** a glowing border line between cyan and red. Fog over unexplored areas.
  - **Boss lair** (Obelisk icon) at the far end with a lock: "RECLAIM 3 STRONGHOLDS · 1/3".
  - **Counterattack alert:** a pulsing red icon "RELAY 2 UNDER ATTACK".
- **Side panel:** "CHOOSE A LIFT": "LIFT 1 · ARRIVAL PLAZA", "LIFT 3 · CONVOY BRIDGE",
  "LIFT 4 · OLD STATION". "SNOW WHITE LV 14". Button "GO UP".

#### W02 · Persistent regions: the frontier · P2
- **Scene:** gameplay. The left half is reclaimed ground with a cool cyan tint: an Ark relay
  turret, supply crates, a mass-produced Nikke guard, few enemies. The right half is red-hazed
  Rapture ground with nest glow and a dense horde. Snow White stands at the boundary.

#### W03 · War map · P1
- **Must show:** a **strategic map of sectors** where liberating sectors moves the front line.
- **Scene:** a holographic war-table map of the surface around the Ark. Sector nodes form a
  grid of hexes:
  - liberated sectors in cyan, Rapture-held in red, and a front line between them
  - red "COUNTEROFFENSIVE" arrows pushing into two cyan sectors
  - a stronghold icon deep in red territory
  - mission markers with job icons
- **Selected sector panel:** "SECTOR C-4 · DEAD CITY", "PURGE · 3 NESTS", "REC. LV 15",
  "REWARD ◆ 30", button "DEPLOY".

#### W04 · The Descent · P1 · *cinematic*
- **Must show:** the **lift is the level transition**. Each floor of a huge structure is a
  map, and you find the lift down. Deeper is richer and more dangerous.
- **Scene:** a lift platform descending into a cavernous **Rapture hive floor**:
  dark-metal-and-organic walls, red glowing veins, steel struts, mist. Snow White on the
  platform looks down at a waiting horde below.
- **HUD:** top centre "FLOOR 07" with "NEXT STATION · FLOOR 08"; objective "FIND THE LIFT DOWN".

#### W05 · The Long Road · P2 · *cinematic*
- **Must show:** a run is **one continuous journey** across changing biomes, with lift stations
  as checkpoints.
- **Scene:** a higher, wider camera over a ruined highway that changes seamlessly across the
  frame, from sakura outskirts on the left into snowfield on the right. A fortified Ark lift
  station with cyan lights stands ahead, and a side branch leads to a wreck. Snow White on the
  road with the horde.
- **HUD:** "STATION 3 · 120 m"; objective "BANK AND LEAVE, OR PUSH ON".

#### W06 · Moving anchor · P2
- **Must show:** your exit is **a vehicle on the move**; get back aboard before it leaves.
- **Scene:** a huge armoured, tracked Ark landship (industrial, white and grey with cyan Ark
  markings) at a stop, starting to roll, its rear ramp down. Snow White runs back toward it with
  the horde behind.
- **HUD:** "DEPARTING 00:18"; edge marker "LANDSHIP 30 m".

#### W07 · Locales and hunts: contract board · P3
- **Scene:** an Ark hub screen titled "CONTRACTS". Three illustrated contract cards:
  - "HUNT · THERMITE ALPHA · FROZEN NORTH" (with the Thermite render)
  - "SALVAGE · CONVOY · ARK OUTSKIRTS"
  - "RESCUE · SQUAD 9 · DEAD CITY"

#### W08 · Outpost layer · P2
- **Must show:** a **home base on the surface** that you build with salvage and defend in raids.
- **Scene:** a surface base on reclaimed ground at dusk: sandbag walls, a workshop shed, a
  med-bay tent, a radar mast, two cyan defence turrets, and an Ark lift in the middle.
  Mass-produced Nikkes man the walls while Raptures emerge from the tree line.
- **HUD:** "RAID IN 00:45".

#### W09 · Day and night layer · P3
- **Scene:** night siege at a floodlit camp around a lift. The horde emerges from darkness
  beyond the light.
- **HUD:** "NIGHT 2 · DAWN IN 01:30".

### U — Progression

#### U01 · Loadout before going up · P2
- **Must show:** your **permanent** progress: level, ability ranks, owned gear, account
  upgrades.
- **Scene:** a full-screen "LOADOUT" screen in `menu-style.jpg` style, with Snow White's
  illustrated portrait at left and "SNOW WHITE · LV 14".
  - **Ability ranks summary:** three compact rows showing filled rank pips: "WEAPON 4/5",
    "SPECIAL 3/5", "BURST 1/5".
  - **Gear:** "NIPMH GEAR", four equipped module slots and a weighted "CAPACITY 7 / 9" bar,
    with a stash grid of owned modules beside it.
  - **Account upgrades:** "CORE DUST 340", five upgrade tiles (ATK, HP, SPD, CRT, XP) with levels.
  - **Footer:** a lift selector, "ARK OUTSKIRTS · LIFT 1", and a big button "GO UP".

---

## Accuracy checklist (review each image before saving)

- [ ] Landscape (16:9, or 21:9 where asked).
- [ ] Gameplay shots use the fixed top-down three-quarter camera, north up, with Snow White
      small near the centre.
- [ ] HUD layout matches `approved-hud.jpg` (plus only the new elements listed for that shot).
- [ ] Every named Rapture matches its render in `references/raptures/`. No generic spiders.
- [ ] The colour language is right: cyan = friendly or interact; red fill = area hit; red line
      = aimed shot (white = firing); orange chevrons = charge path; purple = status; gold = Burst,
      progress or Hunter.
- [ ] No text over enemies or characters, only health bars.
- [ ] No XP gems, no "choose 1 of 3" cards, no other heroes, no old hex dock.
- [ ] The **Must show** point is obvious at a glance.
