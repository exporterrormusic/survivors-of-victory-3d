# Survivors of Victory 3D — visual plan

2026-10-24 · Proposal for review · No gameplay implementation in this pass

[Open the 15-image comparison gallery](concepts/survivors-2026-10-24/index.html) ·
[Image index for GitHub](concepts/survivors-2026-10-24/README.md) ·
[Full prompts and references](concepts/survivors-2026-10-24/manifest.json)

## Direction

Build on the good 2D Survivors of Victory: one distinctive character, manual aiming,
weapon handling, Special and Burst abilities, escalating hordes and deliberate talent
builds. Give that game the current project's 3D characters, environments and bottom HUD.

My recommended starting combination is **H02's centered combat dock, T01's hex talent
tree, and M01 Reclamation as the signature mode**. Reclamation makes existing military
structures and routes matter to a solo player: clear a threat, restore a relay, open a
route and gain support while the horde keeps escalating. Standard survival remains a
useful baseline. The four new modes are alternatives to evaluate, not a commitment to
build four games at once.

The established five-stage operation and maintenance loop gives this more structure
already. The optional route-choice screen F01 could strengthen it later; it is not a
prerequisite for getting the survivor combat right.

## What the references actually contain

The local `_REF/SURVIVORS OF VICTORY - 2026` tree contains the original Godot game and
the `_PHASER` version. Existing code and actual captured screens were checked alongside
the current 3D HUD and the latest painted-environment captures. Older README descriptions
do not always describe the newer operation flow; the active data/UI is the more useful
reference for this plan.

| Existing foundation | Preserve or adapt |
| --- | --- |
| One controllable NIKKE with manual aim | Preserve this combat identity. This is not a new auto-attack-only design. |
| Weapon, Special, Burst, reload and dash | Keep character-specific behavior and readable readiness information. |
| Kill XP awarded directly | Preserve it. The mockups deliberately do not add an XP-gem collection economy. |
| Attack / Skill / Burst talents | Preserve authored nodes, prerequisites and deliberate spending. |
| Seven normal nodes per category plus mastery | Show mastery separately; it activates automatically after all seven normal nodes are owned, without another SP purchase. |
| Staged objectives and maintenance | The code has five-stage operations, several objective types and between-stage credits/NIPMH decisions. These are valuable foundations, not new inventions in this plan. |
| NIPMH stock, reserves and weighted capacity | Retain the distinction between buying, equipping, selling and capacity. |
| Existing permanent progression, settings and unlocks | Preserve their role; this pass does not change the economy or save rules. |
| 3D characters, weapons, terrain, gates, towers, navigation and UI | Reuse suitable parts; the active MOBA match rules still need a separate survivor integration. |

The current character data has **16 placeholder talent nodes each for Cecil, Crown,
Kilo, Sin and Wells**. Commander, Marian, Nayuta, Rapunzel, Scarlet and Snow White have
no nodes named `Placeholder` in the inspected definitions. That does not establish
runtime parity for every mechanic. These mockups use authored Snow White and Scarlet
content; filling the remaining placeholders is separate character design work.

The shared frontend already contains talent/NIPMH data and operation classes. Their
presence does not mean the Babylon match already runs the full 2D survivor loop. Pure
data and rules can be reused; Phaser/Godot world actors need deliberate 3D adapters.

Useful source anchors:

- [Entry and match handoff](../src/app.ts)
- [Snow White talents](../src/characters/snow-white/talents.ts)
- [Scarlet talents](../src/characters/scarlet/talents.ts)
- [Talent layout and mastery rules](../src/frontend/profile/TalentTreeLayout.ts)
- [Talent purchase and automatic mastery UI](../src/frontend/gameplay/ui/RunTalentTree.ts)
- [Five-stage operation / credit rules](../src/frontend/features/nipmh/application/NipmhOperationSession.ts)
- [Objective types](../src/frontend/features/objectives/OperationObjectives.ts)
- [NIPMH content](../src/frontend/features/nipmh/domain/NipmhCatalog.ts)

## Combat and HUD decisions

**H01 — familiar distributed HUD.** Keep the portrait/health at bottom left, outlined
hex controls in the center, and minimap at bottom right. This is the closest visual
continuation of the current MOBA interface. Its cost is looking across a wider span to
check health and ability readiness.

**H02 — centered dock, recommended.** Bring portrait, health, ammo and action states into
one shallow dock. This frees the bottom-left battlefield and reduces eye travel. Keep
the map small enough to support navigation without becoming a second focal point.

**H03 — pressure and melee check.** The same language supports Scarlet's melee weapon,
cooldown and HP-sensitive Burst. Her weapon panel says MELEE instead of presenting a
meaningless ammo bar. A Burst cost belongs beside its action, before activation.

The hexes represent the existing survivor controls: LMB weapon, RMB Special, E Burst,
Shift dash, Tab talents. Reload remains R. These are illustrative default bindings;
the final HUD should display configured bindings rather than hard-coded letters.
Do not carry over five MOBA abilities simply because the existing bar has five slots.

Above the hero, retain at most an optional thin health line. Move Special charges,
Burst gauge, ammo and cooldowns into the dock. No second stack of resource bars or
buttons flanking the world-space health bar. Show a small aim reticle and readable
enemy attack areas, with effects subordinate to movement visibility.

Use a slightly higher, stable camera for horde awareness. These images target desktop
landscape and show a visual direction, not measured camera settings or performance.
The larger crowds and new assets still need a real density/readability check later.

## Four ways to extend the survivor loop

These are design judgments based on this project's assets and systems. Effort is
relative additional work beyond a functioning 3D survivor foundation, not a schedule.

| Concept | Decision it adds | What it reuses | Main new work | Relative added effort |
| --- | --- | --- | --- | --- |
| **M01 Reclamation** | Which relay/route to secure while pressure rises | Gates, towers, forts, terrain, targeting, navigation, objective framework | Relay/jammer states, ownership changes, route unlocks, support behavior and spawn pacing | Medium |
| **M02 Ark Convoy** | Clear a path, take a supply detour or protect the moving base | Roads, military materials, horde combat, maintenance flow | Carrier model, route traversal, obstacles, repair/failure rules and escort tuning | Medium–high |
| **M03 Breach Hunt** | Which boss component to destroy first to remove a dangerous attack | Manual aim, weapons, elite/boss presentation, common horde actors | New multipart boss, hit regions, animations, per-part attacks, melee accessibility | High |
| **M04 Surface Salvage** | Bank current gains or risk more time for another reward | Objective markers, inventory concepts, weather mood, survivor combat | Extraction, advancing hazard, carried/banked rewards, save/economy behavior | Medium–high |

### M01 — Reclamation

Enter a ruined district under continuous horde pressure. Destroy a jammer, restore its
relay, and gain a practical advantage: an opened gate, a safer link between routes or a
support turret. Cleared territory changes how the next fight plays. A final stronghold
or boss provides a finish.

The mockup reads well because the cyan captured tower is already helping while the
player attacks the next red obstacle. It uses the existing environment for more than
decoration. Avoid long stand-in-a-circle timers, constant errands back to a base and
an RTS construction interface. Claim progress by completing a combat task, then move on.

**First useful scope:** one district, a small number of relays, one support effect and
one finish. Add branching operation rewards only after that loop proves worthwhile.

### M02 — Ark Convoy

A mobile command carrier advances through the operation. The player clears blockers,
protects vulnerable stretches and optionally takes a riskier supply route. Checkpoints
naturally lead into the existing maintenance screen.

The carrier makes the objective immediately recognizable, but escort frustration is
the chief risk. It should navigate its route reliably, communicate why it stopped,
and allow the hero to fight ahead without a tiny proximity leash. Avoid requiring
constant healing or allowing unavoidable off-screen damage. The vehicle is a new asset,
not something already present in the project.

### M03 — Breach Hunt

Horde combat continues around a large enemy whose components control distinct attacks.
Destroy a mortar pod to remove artillery; break armor to expose the core. Weapon choice
and aim change the fight before the boss's overall HP reaches zero.

The mockup clearly distinguishes the disabled and active pods. This is the most
expensive option for bespoke encounter content and animation. Scarlet and area-damage
builds need fair ways to damage components; this cannot become a sniper-only mode.
No separate timed aiming or parry minigame is required. It could first be a special
finale inside Reclamation rather than an entire mode.

### M04 — Surface Salvage

Complete optional salvage tasks as pressure and weather worsen. The player sees a safe
exit and a tempting further objective, then decides when to leave. The mockup separates
banked rewards from currently carried salvage.

The choice reads well, but it introduces reward-loss rules that the current game should
not silently inherit. Proposed rule: only unbanked carried rewards are exposed; permanent
unlocks and already banked rewards remain safe. This is a proposal for review, not an
implemented economy change. Keep exits discoverable and avoid surprise point-of-no-return
timers. The storm boundary and extraction logic would be new work.

## Operation flow

**F01** explores one meaningful route fork inside the existing five-stage structure.
Stage 03 offers relay support or supplies, and paths reconnect before the finale.
The selected reward and risk are visible before confirmation. Branching selection and
support carrying between stages are new proposals. The underlying objective/maintenance
structure already exists. A full procedural campaign map is unnecessary for a first pass.

**F02** gives the actual NIPMH maintenance system a dark treatment consistent with the
combat HUD. Credits pay for modules; equipped modules consume weighted capacity; buying
adds to reserve. Echo Chamber, Steady Hands, Redline Instinct and Severed Circuit use
existing content and prices. Three offers are visible to assess layout, not to reduce
the underlying stock size. Preserve sell/capacity actions and a clear continue button.

Do not mix this screen with permanent character upgrades or SP spending. Existing bright
menu screens can remain where they work; the dark treatment is an option for field UI,
not a requirement to reskin the entire application.

## Talent presentation

| Shot | Role | Decision to evaluate |
| --- | --- | --- |
| **T01** | Full hex Attack tree | Recommended default: clearer path and less clutter, with detail on selection |
| **T02** | Same Attack state as readable cards | More effects visible immediately, at the cost of space |
| **T03** | Paused quick-spend drawer | Optional convenience for familiar builds; retain access to every available node and the full tree |
| **T04** | Snow White Skill tree | Demonstrates charge/turret content, prerequisites and automatic Detonation mastery |
| **T05** | Scarlet Burst tree | Demonstrates long names, healing benefit and the Burst's HP cost |
| **T06** | Three-category build overview | Compare owned nodes and mastery progress; navigate into the actual tree to spend |

Keep Attack, Skill and Burst distinct. Do not convert this into random three-card
level-ups, invent mutually exclusive branches or turn mastery into a paid eighth node.
Normal talent state, prerequisite state and selected state need both symbols and color.
Show the SP cost and unmet prerequisite near the action. Mastery gets its own progress
and explicit automatic/no-SP label.

T01/T02 share the actual Snow White Attack graph: Seven Dwarves leads to Weak Point,
Explosive Rounds and Afterburn; Afterburn leads to Burning, Inferno and Charging.
Unyielding is the automatic capstone after all seven normal nodes. The Skill and Scarlet
Burst examples follow their source graphs as well.

The quick drawer is not a limited reward pool: its arrow and available-count indicate
additional choices, and OPEN FULL TREE remains visible. The overview intentionally
lists names and ownership rather than compressing inaccurate effect descriptions into
tiny text. A live implementation should use the same authored description data in every
view, with structured numbers and prerequisites rather than duplicate strings.

While a talent overlay is open in solo play, pause simulation and route inputs to the
menu. Dim and disable the combat dock. Resume must not accidentally fire the weapon or
Burst. Preview-only character-select trees should clearly identify themselves as previews.

## Work after choosing a visual direction

1. **Choose the visual baseline.** Compare H01/H02 and T01/T02. Select one main mode;
   treat the other concepts as retained options. Confirm whether T03 is useful at all.
2. **Mock the chosen mode's full sequence.** For Reclamation: entry, first claim,
   contested route, final objective, maintenance and result. Also check HUD scaling,
   long labels, locked talents, no SP, mastery unlocked and controller focus.
3. **Build one faithful survivor slice.** Snow White, one existing environment, the
   existing movement/aim/Special/Burst behavior, horde pressure, direct XP, a working
   authored tree and an end state. Compare behavior against the 2D reference.
4. **Add the chosen signature mechanic.** For Reclamation, one jammer/relay loop and
   one earned support effect are sufficient to test the idea. Evaluate travel,
   camping, spawn fairness and whether claims change the next fight.
5. **Connect operation progression deliberately.** Maintenance, rewards, loadout and
   persistence follow existing rules unless a proposed change is separately chosen.
6. **Expand characters and encounters after the loop works.** Check melee, sustained
   fire and support builds; adapt their 3D presentation and audit placeholder content.

Useful acceptance checks: aim and enemy tells remain readable under pressure; all
required cooldowns are in the dock; no input leaks through paused menus; mastery can
never be bought or activated early; the selected mode visibly changes a player's next
decision; the game is complete and enjoyable with one player offline.

## Review guide and provenance

Start with **H01 versus H02**, then **M01–M04**, then **T01 versus T02**. T03/T06 are
optional supporting views. F01 is an optional operation expansion; F02 reuses existing
maintenance. Picks can be recorded by ID in the gallery; selecting a picture does not
implement or automatically approve any game changes.

All 15 selected mockups were made with the **built-in imagegen tool** using inspected
local screenshots. Prompts, input paths, portable reference copies, selected revisions
and SHA-256 hashes are in the gallery manifest. Generated files were returned at
**1672 × 941**, despite requesting 1920 × 1080, and are retained without resampling.

These are visual proposals, not captured implemented features. New vehicles, boss
components, relay behavior and storm boundaries require assets/code. Exact effect
rendering, small icon glyphs, bar fill and number spacing remain illustrative. Values
shown are not an approved rebalance. Desktop screenshots do not verify controller,
small-window, ultrawide or runtime performance behavior.

Generated accuracy issues were reviewed: misleading overview effect descriptions were
removed, Scarlet's SP badge was matched to the header, and card-tree category icons and
mastery presentation were refined. Original iterations are retained separately.

The MOBA archive branch/tag/release remain unchanged. See
[MOBA_ARCHIVE.md](MOBA_ARCHIVE.md) for restoration. This work adds design documents and
review images only; it does not alter the game runtime or the separate 2D reference.
