# Kits: Survivors of Victory abilities → MOBA kits

Status (2026-10-24): **first-pass kits exist for all nine playable heroes**, with resources, magazines,
trait hooks and a choice of two heroics each. The numbers are unbalanced. Character Select deliberately keeps the Survivors ability text (user decision). The kit
text shows in the in-match HUD tooltips.

## Goal

Each character keeps their Survivors identity (weapon, special, burst, talent themes) and gains a
Heroes of the Storm layout: basic attack, trait (D), three basic abilities (Q W E), and a choice of two
heroics (R). Kits are **data in each character's folder**
(`src/characters/<id>/kit.ts`) that compose **shared ability systems** in `src/abilities/`.
No hero has bespoke cast code.

## How a kit is built

```ts
// src/characters/<id>/kit.ts
export const kit: Kit = {
  stats: { hp, moveSpeed, resource: { kind: 'mana', max, regen } | { kind: 'fuel', max, regen, delay } | { kind: 'health' } },
  basic: { range, period, damage, aimedRange, tint?, size?, magazine?: { size, reload } },
  trait: { name, desc, chargedShot?, splash?, onHit?, rage?, guard?, redirect? },
  abilities: {
    Q: { name, desc, icon?, cooldown, cost, aim, range, width?, radius?, angle?,
         cast: { kind: 'shot' } | { kind: 'dash', time, invulnerable? } | { kind: 'channel', time },
         effects: [...], sound },
    W, E,
  },
  heroics: [R1, R2],   // same shape as abilities; the player picks one
};
```

Add `kit` (and optionally a `theme` battle track) to the character's `index.ts`. That is all.
The HUD, tooltips, targeting indicators, cast checks and audio read the same data.
`kitOf(character)` falls back to `src/abilities/prototype-kit.ts` for a character without a kit.

## Systems

| System | Where | What it does |
|---|---|---|
| Cast styles | `hero.ts` | `shot`: effects leave 0.1 s into the shot clip. `dash`: travel, effects on arrival, optionally invulnerable. `channel`: aim_start → aim_idle for `time` → aim_end; beams run for the whole channel, other effects fire at its start. |
| bolt | `effects.ts` → `Combat.fireBolt` | line skillshot from the muzzle; pierce; status on hit; `count`/`spread` fan it into a cone |
| lob | `Combat.throwGrenade` | arcing shell to the aim point; area damage, status, optional zone left behind |
| zone | `Combat.addZone` | persistent circle, applied every 0.25 s: damage/s, heal/s (flat or % max HP), enemy status, ally status |
| nova | `Combat.nova` | instant circle at self or aim: damage, enemy status, heal, ally status |
| beam | `Combat.beamStart` | channelled line; dps, width, length, tint |
| self | `effects.ts` | status or heal on the caster (buffs, shields) |
| summon | `Combat.summon` | allied unit on the lane-minion AI. `follow` or `guard`, lifetime, per-caster limit; several spread in a ring. Model: `caster` (clone), `turret` (procedural prop), any chibi `{ variant, aim }`, or a lane Rapture `{ rapture }`. |
| convert | `Combat.convert` | enemy minions in a circle change team for a duration, follow the caster, then revert |
| status | `abilities/status.ts` | on every unit. slow, stun, root, burn, vulnerable; invulnerable, shield, haste, frenzy, empower, fortify. Strongest amount and longest time win; no stacking. |
| cone | `Combat.cone` | instant hit on enemies in a sector in front of the caster; `aim: 'cone'` draws the matching indicator (`src/sector.ts`) |
| knockback | bolt, lob, nova, cone | pushes enemy minions away over 0.2 s (walls stop it) and cancels their windup |
| resources | `hero.ts` | mana (regenerates); fuel (refills after `delay` without spending; Wells); health (abilities cost HP and may not be fatal; Scarlet). The second portrait bar shows it. |
| magazine | `hero.ts` | basic attacks with `magazine` reload after `size` shots; reload sound per weapon; ammo pips above the portrait |
| traits | `hero.ts` | chargedShot (every Nth attack × multiplier), splash (area on basic hits), onHit (status from basic attacks), rage (damage up as HP falls), guard (shield that refills out of combat), redirect (damage taken stored for the next attack) |
| power | `hero.ts` `power` | empower × rage, applied to every effect, beam and basic attack |
| heroics | `hero.ts`, `hud.ts`, `main.ts` | `heroics: [R1, R2]`. R stays locked until the player picks: cards above the portrait, keys 1 / 2. F10 → Heroics: from the start (practice, the default) or at team level 10 (HotS). |
| audio | `match-audio.ts` | the ability's `sound` (weapon, special, dash, beam, heal, summon, none); R adds a voice line |

## Current kits

| Hero | Resource / Basic / Trait | Q | W | E | R1 / R2 |
|---|---|---|---|---|---|
| Snow White | mana / sniper, 7-round magazine / every 3rd shot ×2 | Piercing Shot (pierce bolt) | Auto-Turret (summon turret, 2 max) | Weak Point (bolt + vulnerable 25%) | Seven Dwarves (90° cone, knockback) / Heavy Arms (beam) |
| Scarlet | **health** / melee sword / Blood Price (up to +60% damage as HP falls) | Dash Slash (dash → pierce wave) | Bloodlust (frenzy + haste) | Flash Step (invulnerable blink → nova) | Scarlet Flash (8 m nova, 380 HP) / Black Shadow (invulnerable blink, execute) |
| Rapunzel | mana / rockets / splash 50% | Rocket Barrage (lob) | Divine Blessing (heal zone 3%/s) | Guiding Light (heal nova + slow) | Garden of Shangri-La (heal, invulnerable allies, stun) / Pure Grace (team shield + heal) |
| Nayuta | mana / rings / slow on hit | Summon Clone (follows, 15 s) | Galaxy Orb (lob → slowing zone) | Detachment (dash → slow nova) | Asceticism (lob 180 + stun) / Duality (two clones) |
| Marian | mana / energy bolts / Redirected Energy (50% of damage taken, up to 120, added to the next attack) | Queen's Signal (convert 4 minions) | Particle Lance (pierce bolt) | Heretic Step (dash → burning zone) | Queen Ascendant (shield + beam) / Brood Call (three allied Lures) |
| Crown | mana / minigun / Royal Guard (220 shield refilling after 4 s; slow on hit) | Volley (5-bolt fan + slow) | Summon Trombe (invulnerable charge → stun nova) | Hold the Line (shield + stun nova + knockback) | Last Kingdom (golden nova at range) / Kingdom's Shield (allies fortified 40%) |
| Kilo | mana / shotgun, 8-shell magazine / splash 40% | Slug (heavy bolt + slow + knockback) | Breaching Charge (lob) | Mech Dash (dash → nova) | Assign Priority (frenzy ×2, empower +120%) / Overdrive (shield + haste) |
| Sin | mana / dual SMG / burn on hit | Heavy Talker (convert 3 in area) | Pressure (cone + slow) | Slip Away (dash → haste) | Words Can Kill (8 s burn nova + self heal) / Swift Bunny (haste + frenzy) |
| Wells | **fuel** / sniper, 7-round magazine / every 4th ×2.5 | Precise Shot (long pierce) | Mnemosyne Project (zone: enemies slowed, allies frenzied) | Phase Step (invulnerable blink) | Echoes of Hope (summons Marian) / Time Lock (stun bolt, 3 s) |

Locked (no field model): Commander (assault rifle: Good Genes trait; R Goddess Squad summons Snow
White, Scarlet and Rapunzel, which the summon system can now do with `{ variant }` models) and Cecil
(dual SMG: W Drone Deploy, R System Hack freezes enemies and converts minions).

## Departures from the Survivors kits, and what is still missing

These stand in until the systems below exist. Each kit file's header names its gaps.
- **Basic attack shapes:** Marian's ramping continuous beam, Kilo's 5-pellet cone and the Crown
  minigun spin-up are approximated by fast projectiles.
- **Unit-targeted abilities:** Rapunzel's single-ally heal, Nayuta's clone swap and true single-target
  executes (Black Shadow is a small area for now) need ally or unit targeting.
- **Not yet systems:** position history (Wells' Rewind), transformations (Marian's Heretic body), lifesteal,
  held or toggled abilities (Mnemosyne Project as a fuel-draining hold).
- **Shield stacking:** one shield entry per unit, so a timed shield merging into Royal Guard's
  long-lived one keeps the larger amount and the longer duration.
- **Talents:** map the Survivors talent trees (`src/characters/<id>/talents.ts`) onto HotS tiers 1/4/7/13/16/20 (10 is the heroic).
- **Icons:** abilities without painted art use glyph tiles in the character's accent colour. Most heroics use burst art.

## Order of work from here

1. Talent tray on the same picker (tiers 1/4/7/13/16/20), with talent effects as kit data that modify abilities.
2. Unit targeting (ally and enemy) for heals and executes.
3. Enemy heroes, then a balance pass against them.

New abilities should emit events, not play sounds directly. Audio already follows this: an
ability's `sound` field selects the cue in `src/audio/match-audio.ts`.
