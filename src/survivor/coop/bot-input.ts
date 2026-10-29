// A stand-in co-op partner for Phase 1 (?coop=bot): drives a Teammate through the same InputSource
// a remote player will use in Phase 2. Stays near the leader, shoots the nearest Rapture, backs off
// when one gets close, dashes when hit, uses its Special now and then and Burst when full, walks over
// to revive, and picks a random talent whenever a tier opens.

import { Vector3 } from '@babylonjs/core';
import type { Action, InputSource } from '../input';
import type { Player } from '../player';
import type { Run } from '../run';
import type { TargetField } from '../targets';

const FOLLOW = { near: 3.5, far: 7 };
const KITE = 4;
const SHOOT_RANGE = 14, MELEE_RANGE = 2.6;
/** per frame with a Rapture in range */
const SPECIAL_CHANCE = 1 / 120;

export class BotInput implements InputSource {
  readonly aim = new Vector3();
  private readonly held = new Set<Action>();
  private readonly pressed = new Set<Action>();
  private moveX = 0;
  private moveZ = 0;
  private lastHp = Infinity;
  /** this bot's place around the leader, so several bots spread out */
  private readonly angle: number;

  constructor(slot: number) { this.angle = slot * 2.4; }

  move(): [number, number] { return [this.moveX, this.moveZ]; }
  isHeld(action: Action): boolean { return this.held.has(action); }
  wasPressed(action: Action): boolean { return this.pressed.delete(action); }
  wasReleased(): boolean { return false; }

  /** Decide this frame's controls. `revive`: a downed squadmate to walk to, if any. */
  think(self: Player, run: Run, leader: Vector3, field: TargetField, revive: Vector3 | null): void {
    this.held.clear();
    const tiers = run.tiers, tier = tiers?.pending(run.level) ?? -1;
    if (tiers && tier >= 0) tiers.choose(tier, Math.floor(Math.random() * tiers.tiers[tier].options.length), run.level);
    const p = self.position;
    let enemy: { x: number; z: number } | null = null, enemyDistance = Infinity;
    for (const t of field.targets) {
      if (!t.alive || t.scale < .99) continue;
      const d = Math.hypot(t.position.x - p.x, t.position.z - p.z);
      if (d < enemyDistance) { enemy = t.position; enemyDistance = d; }
    }
    const melee = !!self.kit.weapon.melee;

    let goal: { x: number; z: number };
    if (revive) goal = revive;
    else if (melee && enemy && enemyDistance < SHOOT_RANGE) goal = enemy;
    else {
      goal = { x: leader.x + Math.cos(this.angle) * (FOLLOW.near + FOLLOW.far) / 2, z: leader.z + Math.sin(this.angle) * (FOLLOW.near + FOLLOW.far) / 2 };
      // Back away from anything close, but never wander far from the leader.
      if (enemy && enemyDistance < KITE && Math.hypot(p.x - leader.x, p.z - leader.z) < FOLLOW.far * 1.6)
        goal = { x: p.x + (p.x - enemy.x) * 2, z: p.z + (p.z - enemy.z) * 2 };
    }
    const dx = goal.x - p.x, dz = goal.z - p.z, gap = Math.hypot(dx, dz);
    const stop = revive ? .8 : melee && goal === enemy ? MELEE_RANGE * .7 : 1;
    this.moveX = gap > stop ? dx / gap : 0;
    this.moveZ = gap > stop ? dz / gap : 0;

    if (enemy && enemyDistance <= (melee ? MELEE_RANGE : SHOOT_RANGE)) {
      this.aim.set(enemy.x, 0, enemy.z);
      this.held.add('fire');
      if (!self.kit.weapon.automatic) this.pressed.add('fire');
      if (run.burst >= 100) this.pressed.add('burst');
      // About every two seconds in a fight; the kit ignores it while the Special cools down.
      else if (Math.random() < SPECIAL_CHANCE) this.pressed.add('special');
    } else this.aim.set(p.x + this.moveX * 5, 0, p.z + this.moveZ * 5);

    if (self.hp < this.lastHp && self.hp > 0) this.pressed.add('dash');
    this.lastHp = self.hp;
  }
}
