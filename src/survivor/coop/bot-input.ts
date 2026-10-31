// A stand-in co-op partner for Phase 1 (?coop=bot): drives a Teammate through the same InputSource
// a remote player will use in Phase 2. Stays near the leader, shoots the nearest Rapture, strafes in a
// fight and backs away from the crowd, dashes when hit, uses its Special now and then and Burst when full, walks over
// to revive, and picks a random talent whenever a tier opens.

import { Vector3 } from '@babylonjs/core';
import type { Action, InputSource } from '../input';
import type { Player } from '../player';
import type { Run } from '../run';
import type { TargetField } from '../targets';

const FOLLOW = { near: 3.5, far: 7 };
const KITE = 6;
/** seconds between flips of the strafe direction, so telegraphed attacks aimed at the bot miss */
const STRAFE_FLIP = { min: 1.2, max: 2.6 };
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
  private strafe = Math.random() < .5 ? 1 : -1;
  private strafeIn = 0;
  private lastThink = performance.now();
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
    const now = performance.now(), dt = Math.min(.1, (now - this.lastThink) / 1000); this.lastThink = now;
    const p = self.position;
    // Push away from every Rapture inside kiting range, weighted toward the closest, not just the nearest one.
    let awayX = 0, awayZ = 0;
    let enemy: { x: number; z: number } | null = null, enemyDistance = Infinity;
    for (const t of field.targets) {
      if (!t.alive || t.scale < .99) continue;
      const d = Math.hypot(t.position.x - p.x, t.position.z - p.z);
      if (d < enemyDistance) { enemy = t.position; enemyDistance = d; }
      if (d < KITE && d > .01) { const w = (KITE - d) / KITE / d; awayX += (p.x - t.position.x) * w; awayZ += (p.z - t.position.z) * w; }
    }
    const melee = !!self.kit.weapon.melee;

    let goal: { x: number; z: number };
    if (revive) goal = revive;
    else if (melee && enemy && enemyDistance < SHOOT_RANGE) goal = enemy;
    else {
      goal = { x: leader.x + Math.cos(this.angle) * (FOLLOW.near + FOLLOW.far) / 2, z: leader.z + Math.sin(this.angle) * (FOLLOW.near + FOLLOW.far) / 2 };
      // Back away from anything close, but never wander far from the leader.
      const away = Math.hypot(awayX, awayZ);
      if (away > 0 && Math.hypot(p.x - leader.x, p.z - leader.z) < FOLLOW.far * 1.6)
        goal = { x: p.x + awayX / away * 4, z: p.z + awayZ / away * 4 };
    }
    const dx = goal.x - p.x, dz = goal.z - p.z, gap = Math.hypot(dx, dz);
    const stop = revive ? .8 : melee && goal === enemy ? MELEE_RANGE * .7 : 1;
    let mx = gap > stop ? dx / gap : 0, mz = gap > stop ? dz / gap : 0;
    // In a fight, never stand still: strafe around the enemy and flip now and then, the way a
    // player sidesteps telegraphed strikes, lanes and missiles aimed at where they stood.
    if (!revive && enemy && enemyDistance < SHOOT_RANGE * 1.2) {
      this.strafeIn -= dt;
      if (this.strafeIn <= 0) { this.strafe = -this.strafe; this.strafeIn = STRAFE_FLIP.min + Math.random() * (STRAFE_FLIP.max - STRAFE_FLIP.min); }
      const ex = p.x - enemy.x, ez = p.z - enemy.z, e = Math.hypot(ex, ez) || 1;
      mx += -ez / e * this.strafe * .8; mz += ex / e * this.strafe * .8;
      const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; }
    }
    this.moveX = mx; this.moveZ = mz;

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
