# Character weapon combat

The primary weapons now use the Godot / Phaser firing patterns in both MOBA targeting
and WASD cursor aim. Attack orders keep firing while the target is in range and visible;
WASD supports moving while holding fire. Model animation length does not limit cadence.

| Character | Primary behavior | Interval | Magazine / reload |
| --- | --- | --- | --- |
| Snow White | Fast, long piercing sniper rounds; existing every-third-shot trait | 0.35 s | 7 / 1.5 s |
| Wells | Piercing sniper rounds with a teal tracer | 0.35 s | 7 / 1.5 s |
| Scarlet | Alternating sword crescents, damaging enemies in the forward sweep | 0.30 s | Unlimited |
| Rapunzel | Slow rockets that explode on impact or at the aimed position | 0.50 s | 4 / 3 s |
| Nayuta | Two parallel SMG rounds per volley | 0.08 s | 30 volleys / 2 s |
| Sin | Two parallel SMG rounds; existing vulnerability on hit | 0.08 s | 30 volleys / 2 s |
| Crown | Sustained minigun stream with golden tracers | 0.06 s | 100 / 3.5 s |
| Kilo | Five independently colliding pellets across a 15-degree spread | 0.40 s | 8 / 2.5 s |
| Marian | 0.4-second wind-up into a continuous piercing beam that follows aim | 0.06 s ammo ticks | 100 / 3.5 s |

Damage is per volley and is divided between SMG rounds / shotgun pellets. Rapunzel's
existing trait keeps direct-hit splash at 50% damage to surrounding enemies. A rocket
that reaches its aimed endpoint explodes there. Marian's stored-damage trait is released
once on the next beam tick; it is not multiplied into every subsequent damage frame.
Ranges, health, abilities and trait effects remain MOBA kit data. These are initial balance
values, not a port of Survivors progression or shop/talent unlocks.

Commander and Cecil still have no selectable field model. They remain locked.

## Sources

- `_REF/SURVIVORS OF VICTORY - 2026/_PHASER/src/game/gameplay/data/CombatData.ts`:
  weapon families, intervals, ammunition, spread, paired SMG damage and speeds.
- `_PHASER/src/game/scenes/SurvivorGameScene.ts` within that reference:
  `fireWeaponProjectiles`, piercing sniper shots, separated SMG muzzles and pellet fans.
- `_PHASER/src/game/gameplay/systems/CharacterAbilitySystem.ts`:
  `updateMarianAttackBeam`, the 0.4-second wind-up and sustained beam damage.
- Godot `scripts/characters/{Scarlet,Rapunzel,Nayuta,Sin,Kilo,Crown,Marian}Controller.gd`:
  melee sweep, rocket targeting, paired SMG rounds and character weapon behavior.

## Implementation and checks

`BasicAttack.weapon` is a discriminated pattern in `src/abilities/types.ts`.
`src/weapons.ts` emits the pattern; `src/hero.ts` drives input, wind-up, cadence and ammo.
`src/combat.ts` resolves swept projectile hits, cover, explosions, melee and beam damage.
`src/weapon-vfx.ts` pools tapered tracers, finned rockets, exhaust, impact sparks,
charge rings and sword crescents. The beam has an emissive shell and core with a looping
sound that stops on interruption. Large magazines use grouped HUD pips plus a count.

`artifacts/ui/weapons/verify.mjs` exercises all nine playable kits in both targeting
modes, sword cleave, paired rounds, shotgun damage distribution, sniper tunneling and
piercing, interception order, rocket splash and endpoint detonation, cover, beam wind-up,
redirect and interruption, reloads, moving fire, frame-independent cadence and mesh reuse.
It uses a fixed muzzle to isolate mechanics. `capture.mjs` checks attacks with each actual
animated model and saves screenshots. Their JSON reports record the results.
