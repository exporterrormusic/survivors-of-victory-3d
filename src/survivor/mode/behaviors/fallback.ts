// Fallback for roles without their own behavior yet: the test range's charge-and-bolt attack
// (enemy-attack.ts), so every spawned Rapture fights.

import { EnemyLaserAttack } from '../../enemy-attack';
import type { Target } from '../../targets';
import type { RaptureSpec } from '../roster';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

/** Raptures with a gun on each side: one bolt from each per volley. */
const TWIN_BARRELS = new Set(['hardHat']);

class LaserBehavior implements Behavior {
  private readonly attack: EnemyLaserAttack;
  private readonly target: Target;

  constructor(ctx: BehaviorContext, target: Target, spec: RaptureSpec) {
    this.target = target;
    this.attack = new EnemyLaserAttack({ vfx: ctx.vfx, snow: ctx.snow, targets: ctx.field }, target, ctx.player, 1 + Math.random() * 2, ctx.pacing,
      TWIN_BARRELS.has(spec.key) ? 2 : undefined);
  }

  get active(): boolean { return this.target.alive; }
  update(dt: number): void { this.attack.update(dt); }
  dispose(): void { this.attack.dispose(); }
}

export const fallback: BehaviorFactory = (ctx, target, spec) => new LaserBehavior(ctx, target, spec);
