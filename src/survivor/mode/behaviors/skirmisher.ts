// Skirmisher (Twin Tail): a fast spider that circles the player at its range instead of closing
// in. Every 3.5 s both tails charge twin parallel red lanes, one on each side of it (they lock for
// 1 s), then fire beams 18 m long. Lead your shots along its circle; stand between or
// outside the lanes.

import { Vector3 } from '@babylonjs/core';
import type { Target } from '../../targets';
import type { RaptureSpec } from '../roster';
import { Beam } from './beam';
import { clearShot, flatDistance } from './common';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

const COOLDOWN = 3.5;
const ORBIT = 3.2;
const GAP = 1.1;

class SkirmisherBehavior implements Behavior {
  private cooldown = 1 + Math.random() * COOLDOWN;
  private orbit = Math.random() < .5 ? 1 : -1;
  private readonly beams: Beam[];
  private readonly ctx: BehaviorContext;
  private readonly target: Target;
  private readonly spec: RaptureSpec;

  constructor(ctx: BehaviorContext, target: Target, spec: RaptureSpec) {
    this.ctx = ctx; this.target = target; this.spec = spec;
    this.beams = [-GAP, GAP].map((side) => new Beam(ctx, target, {
      length: 18, width: .7, charge: 1.8, lock: 1, fire: .25, tick: 0, damage: spec.damage, aim: 1.2, track: 0, side,
    }));
  }

  get active(): boolean { return this.target.alive; }

  update(dt: number): void {
    const { target, ctx } = this;
    if (!target.alive || ctx.player.hp <= 0) { this.stop(); return; }
    if (this.beams[0].busy) {
      for (const beam of this.beams) beam.update(dt);
      if (!this.beams[0].busy) this.cooldown = COOLDOWN;
      return;
    }
    const distance = flatDistance(target.position, ctx.player.position);
    this.circle(dt, distance);
    this.cooldown -= dt;
    if (this.cooldown > 0 || target.scale < .99 || target.stunned > 0) return;
    if (distance > this.spec.range + 4 || !clearShot(ctx, target.position, ctx.player.position)) return;
    for (const beam of this.beams) beam.start();
  }

  /** Strafe sideways around the player once in range; flip direction now and then. */
  private circle(dt: number, distance: number): void {
    const { target, ctx } = this;
    if (target.stunned > 0 || target.scale < .99 || distance > this.spec.range + 1.5) return;
    if (Math.random() < dt * .12) this.orbit *= -1;
    const dx = (ctx.player.position.x - target.position.x) / (distance || 1), dz = (ctx.player.position.z - target.position.z) / (distance || 1);
    // push decays at 7/s, so this settles near ORBIT m/s
    target.shove(new Vector3(dz * this.orbit, 0, -dx * this.orbit).scaleInPlace(ORBIT * 7 * dt));
  }

  private stop(): void { for (const beam of this.beams) beam.stop(); }

  dispose(): void { this.stop(); }
}

export const skirmisher: BehaviorFactory = (ctx, target, spec) => new SkirmisherBehavior(ctx, target, spec);
