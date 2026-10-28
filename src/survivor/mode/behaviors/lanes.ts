// Lane-fire roles (these models have no leap or charge clips, so they shoot instead of dashing):
// - Charger (Capra), Ram Cannon: a stationary threat. It plants, a red lane swings onto its target
//   and locks, then it holds a sustained beam for over two seconds that slowly tracks, ticking
//   damage and scorching the ground where it lands. Kill it, flank it, or keep moving.

import { Vector3 } from '@babylonjs/core';
import type { Target } from '../../targets';
import type { RaptureSpec } from '../roster';
import { TELL } from '../telegraph';
import { Beam, type BeamTuning } from './beam';
import { clearShot, flatDistance } from './common';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

interface LaneTuning {
  readonly beam: BeamTuning;
  /** one beam per entry, at that angle (rad) off the player line */
  readonly fan: readonly number[];
  readonly minRange: number;
  readonly maxRange: number;
  readonly cooldown: number;
  /** backward shove on firing, m/s */
  readonly recoil: number;
  /** leave burn marks where the beam lands while it fires */
  readonly scorch?: boolean;
}

class LaneBehavior implements Behavior {
  private cooldown: number;
  private kicked = false;
  private scorchIn = 0;
  private readonly beams: Beam[];
  private readonly ctx: BehaviorContext;
  private readonly target: Target;
  private readonly tuning: LaneTuning;

  constructor(ctx: BehaviorContext, target: Target, tuning: LaneTuning) {
    this.ctx = ctx; this.target = target; this.tuning = tuning;
    this.beams = tuning.fan.map(() => new Beam(ctx, target, tuning.beam));
    this.cooldown = 1 + Math.random() * tuning.cooldown * .5;
  }

  get active(): boolean { return this.target.alive; }

  update(dt: number): void {
    const { target, ctx, tuning } = this;
    if (!target.alive || ctx.player.hp <= 0) { this.stop(); return; }
    if (this.beams[0].busy) {
      for (const beam of this.beams) beam.update(dt);
      if (this.beams[0].firing && tuning.scorch && (this.scorchIn -= dt) <= 0) { this.scorchIn = .12; this.beams[0].scorch(); }
      if (!this.kicked && this.beams[0].firing && tuning.recoil > 0) {
        this.kicked = true;
        target.shove(new Vector3(-Math.sin(target.yaw), 0, -Math.cos(target.yaw)).scaleInPlace(tuning.recoil));
      }
      if (!this.beams[0].busy) this.cooldown = tuning.cooldown;
      return;
    }
    this.cooldown -= dt;
    if (this.cooldown > 0 || target.scale < .99 || target.stunned > 0) return;
    const distance = flatDistance(target.position, ctx.player.position);
    if (distance < tuning.minRange || distance > tuning.maxRange || !clearShot(ctx, target.position, ctx.player.position)) return;
    this.kicked = false;
    tuning.fan.forEach((offset, i) => this.beams[i].start(offset));
  }

  private stop(): void { for (const beam of this.beams) beam.stop(); }

  dispose(): void { this.stop(); }
}

export const charger: BehaviorFactory = (ctx, target, spec: RaptureSpec) => new LaneBehavior(ctx, target, {
  // Planted for the whole attack (mobile: false). ~4 damage a tick for 2.4 s if you stand in it.
  beam: { length: 18, width: 1.7, charge: 1.6, lock: .7, fire: 2.4, tick: .25, damage: Math.max(2, Math.round(spec.damage * .3)), aim: .7, track: .32, tell: TELL.charge, mobile: false },
  fan: [0], minRange: 3, maxRange: 15, cooldown: 5.5, recoil: 0, scorch: true,
});
