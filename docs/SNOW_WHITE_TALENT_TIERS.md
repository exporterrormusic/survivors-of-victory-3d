# Snow White — HotS-style talent tiers (proposal)

2026-10-26. Proposal for review, not implemented. Would replace the ordered Weapon / Special /
Burst rank tracks (`src/survivor/ability-ranks.ts`) and the lobby capstone loadout.

## Problem

The current tracks sell 15 ranks for 30 SP, and a good run buys nearly all of them. Every run
ends with the same kit, so choices are only about order. There is no build identity and
little reason to replay.

## How Heroes of the Storm does it

- Talents come at fixed levels: **1, 4, 7, 10, 13, 16, 20**. Seven picks per match.
- Each tier offers **3–5 mutually exclusive** choices. A match ends with about 7 of roughly
  20–25 talents, so most of the list is *not* taken.
- A tier usually offers one upgrade per ability (Q / W / E) or a survival/utility option.
  Picking the same ability's option tier after tier produces a "Q build" or "W build".
- **Level 10** picks one of two heroic abilities: the big power spike and build-defining choice.
- **Level 20** ("storm" tier) upgrades the chosen heroic or offers a very strong capstone.
- **Level 1** often has quest talents: complete a goal during the match to unlock a bonus.
- Talents change how abilities behave, change the trait, add conditional stats, or add an
  active ability. Blizzard's stated aim: a few strong options per tier, not many weak ones.
- Separately, heroes gain a few percent of base stats every level, so levels still feel
  like progress between talent tiers.

## Applied to Snow White

Snow White has three abilities, each with 7 existing effect flags. The plan unbundles them so
each flag is a single talent. Each tier offers one **Rifle**, one **Turret** and one
**Burst** or **Utility** option. Level 10 and level 20 are the spike tiers.

20 talents total, 7 picked per run. 17 run on combat code that already exists; 3 are new (★).
Numbers in the tables below are the current in-game values. **The balance pass at the end of
this document replaces several of them**; where the two disagree, the balance pass wins.

| Lv | Rifle | Turret | Burst / Utility |
| --- | --- | --- | --- |
| **1** quests | **Marked Rounds**: hits apply Weak Point (4× damage taken). *Quest:* 150 kills on marked enemies → **Explosive Rounds** (25% of bullet kills explode). | **Expanded Arsenal**: turrets carry 8 missiles. *Quest:* 120 missile kills → store 4 charges and deploy up to 4 turrets. | **Fully Active**: Burst burns 20% max HP/s for 3 s. *Quest:* 60 Burst kills → direct Burst kills have a 50% chance to refund gauge. |
| **4** | **Afterburn**: shots leave a damaging fire trail. | **Incendiary Arsenal**: missiles burn for 4× missile damage over 5 s. | **Pierce Through**: Burst applies Weak Point. |
| **7** | **Charging**: hold fire up to 3 s; shot and trail up to 5× wider. | **Defensive Line**: turrets deal missile damage every second in an aura. | **Shock Blast**: Burst stuns for 5 s (bosses: shorter, TBD). |
| **10** Burst form | — | — | Pick one: **Focused Fire**: hold Burst up to 2.5 s; the cone narrows 90°→15° for up to 6× damage. **or** **A Century of Prep Time**: Burst also deploys four turrets around you. |
| **13** | **Inferno**: bullets ignite enemies (5× attack over 5 s); anything burning, from any source, is slowed 30%. | **Permanent Emplacement**: empty turrets reload in ~6 s instead of expiring. | **Unyielding** (utility): 20% of direct bullet kills restore 1 HP. |
| **16** | ★ **Quick Hands**: bullet kills refund 1 round; reload 40% faster. | **Armor Piercing**: missiles mark targets to take 4× damage; stacks with Weak Point. | ★ **Cold Focus** (utility): Focus starts after 1 s instead of 3 s and holds for 1.5 s after moving. |
| **20** storm | ★ **Seventh Dwarf**: every 7th shot is a piercing round at Burst-level damage. | **Detonation**: the last missile of every turret load is a heavy warhead (3× damage, 3× radius). | **A Goddess Who Cannot Yield**: on Burst, 25% keep all gauge, 25% keep half. Works with either level-10 form. |

### What each talent does

Snow White's kit, as a reminder:
- **Rifle** (left click): long-range semi-automatic shots that pierce every enemy in their path. Uses a magazine; R reloads.
- **Turret** (right click): places a missile launcher that fires homing missiles automatically. 2 charges, 8 s recharge.
- **Burst** (E): a long-range 90° cone blast once the Burst gauge is full. Usable from the start.

**Burn sources.** Snow White has three ways to set enemies on fire, one per ability, and each is a talent:
**Afterburn** (rifle trail, together with Inferno), **Incendiary Arsenal** (missiles) and **Fully
Active** (Burst). Inferno now ignites enemies itself, so it also works when it's your only fire talent.

| Talent | Ability | What it does | Plays like |
| --- | --- | --- | --- |
| Marked Rounds (quest) | Rifle | Bullet hits mark enemies with Weak Point, so they take 4× damage from everything. Quest reward: 25% of bullet kills explode and hit nearby enemies. | Tag and shred |
| Afterburn | Rifle | Each shot leaves a strip of fire on the ground along its path that damages enemies walking through it. | Lay fire lines across lanes |
| Charging | Rifle | Hold the fire button up to 3 s; the released shot (and its fire trail) is up to 5× wider. | Fewer, bigger shots |
| Inferno | Rifle | Bullets set enemies burning (5× attack over 5 s). Any burning enemy, from any of the three sources, is slowed 30%. | Kite a slowed crowd |
| ★ Quick Hands | Rifle | Bullet kills put a round back in the magazine; reload is 40% faster. | Keep firing, rarely reload |
| ★ Seventh Dwarf | Rifle | Every 7th shot is a piercing round that hits as hard as a Burst. | Count your shots for the big one |
| Expanded Arsenal (quest) | Turret | Each turret holds 8 missiles instead of 4. Quest reward: 4 stored charges and up to 4 turrets at once. | More turrets out |
| Incendiary Arsenal | Turret | Missiles set enemies burning (4× missile damage over 5 s). | Turrets as fire support |
| Defensive Line | Turret | Each turret damages every enemy within a short radius once per second. | Turrets as a zone to fight in |
| Permanent Emplacement | Turret | Empty turrets reload (~6 s) instead of disappearing. Placing one over the cap removes the oldest. | Build a fixed fortress |
| Armor Piercing | Turret | Missile hits mark enemies to take 4× damage; stacks with Weak Point. | Turrets soften bosses |
| Detonation | Turret | The last missile in each turret load is a heavy warhead: 3× damage, 3× blast radius. With Permanent Emplacement, every reload brings another warhead. | Big boom every load |
| Fully Active (quest) | Burst | Burst sets enemies burning for 20% of their max HP per second for 3 s. Quest reward: Burst kills can refund gauge. | Burst clears the screen |
| Pierce Through | Burst | Burst applies Weak Point (4× damage taken) to everything it hits. | Burst opens a damage window |
| Shock Blast | Burst | Burst stuns everything it hits for 5 s (shorter on bosses). | Burst as an escape or reset |
| Focused Fire (Lv 10 form) | Burst | Hold E up to 2.5 s; the cone narrows to a 15° beam that deals up to 6× damage. | Sniper Burst for bosses |
| A Century of Prep Time (Lv 10 form) | Burst | Using Burst also deploys four turrets around you. | Burst builds a fort instantly |
| A Goddess Who Cannot Yield | Burst | Each Burst has a 25% chance to keep the whole gauge and a 25% chance to keep half. | Burst far more often |
| Unyielding | Utility | 20% of bullet kills heal 1 HP. | Sustain while fighting |
| ★ Cold Focus | Utility | Focus starts after 1 s instead of 3 s, and holds for 1.5 s after you move. | Snipe while repositioning |

### Builds this supports

- **Pyro marksman:** Marked Rounds → Afterburn → Charging → Focused Fire → Inferno → Quick Hands → Seventh Dwarf.
- **Engineer:** Expanded Arsenal → Incendiary → Defensive Line → Century of Prep → Permanent
  Emplacement → Armor Piercing → Detonation. You place a fortress and kite enemies through it.
- **Burst cycler:** Fully Active → Pierce Through → Shock Blast → Focused Fire → Unyielding → Cold Focus → Goddess.
- **Hybrids:** Incendiary + Inferno makes turret fire slow enemies; Marked Rounds + Armor Piercing
  stack marks for boss burst windows; Century of Prep + Detonation turns every Burst into a minefield.

That gives 3⁶ × 2 = 1,458 possible sets, about a third of the talents per run, and at least three
builds that play clearly differently.

## Supporting changes

1. **Base growth per level.** +4% damage and +4% max HP each level, automatic. Levels between
   tiers still matter, and talents stay focused on behaviour rather than raw numbers.
2. **Pacing (genre undecided).** Defined as a share of a run's XP, not minutes: the level-1 pick
   when the elevator opens, level 10 near the halfway point, level 20 shortly before the final
   fight. A 20-minute Survival Round, an elevator boss rush or something else can then set its XP
   curve to hit those points.
3. **Pick UI (no pause, HotS layout).** The game keeps running. When a tier unlocks, a talent
   button above the bottom-left portrait glows. Opening it shows the tier's 2–3 talent icons in
   a row, with name and one-line description on hover. Click an icon or press Ctrl+1/2/3 to pick.
   Picks can wait, and if two tiers are open the older tier comes first. Quest progress shows
   as a small counter on the talent's icon. Tab shows the full 7-tier grid with chosen
   talents lit and future tiers dimmed; it is read-only.
4. **Inferno change.** Today the burn and slow (`burning`, `inferno`) only apply inside the
   Afterburn trail (`weapon.ts:126`). Inferno becomes: bullets ignite enemies on hit, and any
   burning enemy (Afterburn, Incendiary missiles, Fully Active Burst, or Inferno itself) is
   slowed 30%. It works alone and gets better with other fire picks.
5. **Remove the lobby capstone.** Level 20 replaces it (`capstone-loadout.ts`).
6. **Code shape.** Replace `AbilityTrack.ranks` with `TalentTier { level, options[] }`. Each option keeps
   an `effects: string[]` list, so `RunTalents.has()` and all combat checks stay unchanged.
   Quests add an optional `{ counter, goal, rewardEffects }`. Data-only, so other NIKKEs
   (Scarlet already has `ranks.ts`) follow the same pattern.

## Long-term replay (optional, later)

- **Unlockable options:** start with 2 options per tier and spend Rapture Cores to add a 3rd and
  then a 4th. Meta progression adds *choices*, not power, which fits "never punish playing".
- **Fourth column:** a Utility option on every tier (dash, healing, movement, pickup range).
- **Run modifiers / boss-specific picks** once more bosses exist.

## Balance pass (2026-10-26)

### Baseline from the code

| Thing | Value | Source |
| --- | --- | --- |
| Rifle | 7 damage, 30% crit at 1.5×, 7 rounds, 0.35 s between shots, 1.5 s reload, pierces everything | `snow-white/index.ts`, `run.ts` |
| Rifle sustained single-target DPS | ≈ 15–16 (7 shots per 3.6 s cycle) | derived |
| Burst | 10× attack = 70 in a 90° cone | `burst.ts:21` |
| Burst gauge | +7 per bullet hit **per target hit**; 100 to fill | `run.ts:109` |
| Turret missile | 0.5× attack = 3.5 damage, 4 missiles, one every 2 s; 2 charges, 8 s recharge | `turret.ts:27-30, 550` |
| Marks | damage taken × 4^(number of marks): one mark 4×, two marks 16×. Applies to burns too | `targets.ts:63` |
| Max HP | 50 | `snow-white/index.ts` |
| Enemies | horde 6–30 HP, specialists 14–70, heavies 450–800, Obelisk 3,500 | `mode/roster.ts` |

Rough times to kill Obelisk with the current numbers: rifle only, about 225 s. With
Marked Rounds, about 56 s. With Marked Rounds and Fully Active, **two Bursts**: the burn takes
60% of max HP, and Weak Point multiplies that by 4. In a crowd, the Burst gauge refills in
roughly three shots.

These values came from a system where you eventually owned every upgrade, so no single upgrade
had to compete. Once picks are exclusive, a handful of them decide every run.

### What breaks

1. **Marks multiply instead of add.** Weak Point alone is a permanent 4× on everything after the
   first hit, and it's a level-1 pick. Weak Point + Armor Piercing = 16×. Every build would take
   Marked Rounds, and the other level-1 options can't compete.
2. **Fully Active burns a share of max HP.** 60% of a boss's health per Burst ignores how
   tough bosses are, and it gets multiplied by marks. It's a boss killer at level 1.
3. **Burst gauge per target pierced.** One shot through five enemies gives 35 gauge. In
   hordes, Burst is up every few seconds, so every Burst talent (stun, burn, Goddess)
   becomes much stronger than the rest.
4. **Shock Blast 5 s stun** + Burst every few seconds = everything permanently stunned, bosses included.
5. **Pierce Through duplicates Marked Rounds.** Both apply the same Weak Point mark, so taking both adds almost nothing.
6. **Turrets are far too weak.** 3.5 damage per missile doesn't kill the weakest enemy (Lure, 6 HP).
   The turret build (Defensive Line 3.5/s, Detonation 10.5) would be clearly the worst.
7. **Charging only widens the shot.** Holding fire for 3 s gives up ~8 shots for a wider
   one at the same damage, so it lowers damage except against tight crowds.
8. **Quick Hands + piercing = endless ammo.** One shot can kill several enemies, and each kill refunds a round.
9. **Detonation and Permanent Emplacement work against each other.** Permanent turrets never expire,
   so they only explode when you go over the turret cap.
10. **Unyielding does nothing in boss fights.** It only heals on kills.

### Fixes

Target: an ordinary talent adds about +25–40% to the thing it upgrades. Level 10 and 20 picks add +50–80%.
A finished build should kill Obelisk in roughly 30–60 s, whatever the build.

| Talent / system | Now | Proposed |
| --- | --- | --- |
| **Mark math** (`targets.ts:63`) | × 4^marks, marks stack | **One mark per target, ever.** A new mark replaces the current one only if it is at least as strong (equal strength refreshes the timer). Damage taken × (1 + mark bonus) |
| Marked Rounds | Weak Point 4×, permanent | Weak Point: +50% damage taken for 4 s, refreshed on hit. Quest: 150 marked kills → Explosive Rounds |
| Pierce Through → **Shatter** | Burst applies Weak Point | Burst deals **double damage to marked or burning enemies**. Rewards other picks instead of duplicating one |
| Armor Piercing | Missiles mark 4× | Armor Break: +75% damage taken for 6 s. Stronger than Weak Point, so it overwrites it; Weak Point can't overwrite it back until it expires |
| Fully Active | 20% max HP/s for 3 s | Burn for 30% of Burst damage per s for 3 s (+90% Burst damage over time). No %-HP damage |
| Fully Active quest reward | 50% chance of +7 gauge per Burst kill | +3 gauge per Burst kill, max 30 per Burst |
| **Gauge per shot** (`run.ts:109`) | +7 per target hit | +7 for the first target, +2 per extra target, max 15 per shot |
| Shock Blast | 5 s stun on everything | 1.5 s stun. Heavies 0.5 s. Bosses: interrupts their current attack instead |
| Charging | Up to 5× wider, same damage, 3 s hold | 1.5 s hold. Up to 3× damage and 3× width |
| Quick Hands | Every kill refunds a round | Max 1 round per shot; reload 30% faster |
| **Missile damage** (`turret.ts:550`) | 0.5× attack (3.5) | 1× attack (7). Base turret ≈ 7 DPS while it has ammo |
| Defensive Line | 3.5 per s | 1× attack per s (7) |
| Detonation | Turret explodes when destroyed or retired | **Warhead:** the last missile of every turret load is a heavy warhead (3× missile damage, 3× blast radius). No longer tied to the turret dying |
| Unyielding | 20% of bullet kills heal 1 HP | Bullet kills heal 1 HP; every 10 rifle hits on a heavy or boss heal 1 HP |
| Focused Fire | Up to 6× | Up to 4×. With Shatter, 8× of 70 = 560 per full charge ≈ 16% of Obelisk |
| Base growth | — | +4% damage and HP per level (≈ ×2.1 at level 20) |

Unchanged: Afterburn, Inferno (already reworked above), Incendiary Arsenal, Expanded Arsenal,
Permanent Emplacement, Century of Prep (better now that missiles are stronger), Goddess (keeping
~37% of gauge on average means ~60% more Bursts, about right for level 20), Seventh Dwarf (one
70-damage round per 7-shot magazine ≈ +25% rifle DPS), Cold Focus.

**Mark rule (decided by the user).** Only one mark can be on a target. The strongest one
wins; a weaker mark is ignored until the stronger one expires. Current marks: Weak Point
(+50%, 4 s, rifle) and Armor Break (+75%, 6 s, turret). Taking both doesn't stack them: Armor
Break covers bosses and turret zones, and Weak Point fills in on enemies the missiles don't
reach. Shatter (Burst ×2 vs marked or burning) reads "is there a mark" and doesn't care which.
Code: replace `Target.marks` (a Set) with one `{ kind, bonus, remaining }` slot;
`status-vfx.ts` checks `marks.size` in three places and needs the same change.

**Detonation vs Permanent Emplacement (decided: change Detonation).** The old Detonation
paid off when a turret died; Permanent Emplacement stops turrets dying, so the two cancelled out.
Detonation now hits on the last missile of each load. That pays off with or without permanent
turrets, and with them it fires once per reload. Permanent Emplacement stays as it is, since
it's the core of the fortress build. It can reuse the existing `explode()` in `turret.ts`.

### Tier-by-tier check after the fixes

- **L1:** Weak Point (+50% to everything) vs more turret ammo vs Burst burn (+90% Burst). Close;
  the turret quest is the hardest to complete, so its reward can be the strongest.
- **L4:** All three are damage-over-time or synergy picks for their ability. Even.
- **L7:** Charging (burst-damage rifle) vs Defensive Line (turret zone) vs Shock Blast
  (control). Different jobs, so the right pick depends on the mode. Good.
- **L10:** Focused Fire = boss damage, Century of Prep = crowd and positioning. A real choice.
- **L13/L16:** Inferno and Quick Hands are the strongest rifle picks; Cold Focus and Unyielding
  give survival-minded players an option on every late tier.
- **L20:** Seventh Dwarf ≈ +25% rifle DPS; Detonation is crowd damage; Goddess ≈ +60% Bursts.
  Roughly even, each suiting a different build.

### Still to watch

- **Columns can become fixed paths.** Since every tier is "rifle vs turret vs Burst", the strongest
  column could become the only path. Shatter, Inferno and Armor Piercing reward picks in
  other columns; add more cross-column talents like these over time.
- **Quest goals depend on run length.** Set them as a share of a run's expected kills so they
  finish around the halfway point, and log completion times.
- **Tune with measurements, not paper math.** Add a debug readout of damage per source
  (rifle / burn / turret / Burst) and time-to-kill on the Test Range dummy for each build.

## Decided (2026-10-26)

- Picks do not pause; the UI sits above the bottom-left portrait, as in HotS.
- Burst is usable from the start (it is one of the three abilities). Level 10 picks its form; it does not unlock it.
- Not tuned to a mode yet: the genre is still open, so pacing is expressed as a share of run XP.

Sources: [Wikipedia: Heroes of the Storm](https://en.wikipedia.org/wiki/Heroes_of_the_Storm),
[Blizzard: Core Concepts](https://news.blizzard.com/en-gb/heroes-of-the-storm/20720242),
[HotS archive wiki: Talent](https://heroesofthestorm-archive.fandom.com/wiki/Talent).
