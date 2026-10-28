// Spotter (Cube): holds 14–20 m off and paints the player with a thin red laser for 2 s. If it
// keeps line of sight the whole time, it calls a strike: three red circles, one on the player and
// two where they're heading, landing 1.2 s later. Break line of sight behind cover to cancel the
// call, or kill it first; it's fragile, and killing it calls off any strike still falling.

import { Vector3 } from '@babylonjs/core';
import type { Target } from '../../targets';
import type { RaptureSpec } from '../roster';
import { clearShot, flatDistance, leadSpot } from './common';
import { ENERGY, EnergyBeam } from './energy';
import { StrikeField } from './strikes';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

const PAINT = 2;
const COOLDOWN = 6.5;
const STRIKE_RADIUS = 2.5;
const STRIKE_FUSE = 1.2;

class SpotterBehavior implements Behavior {
  private cooldown = 2 + Math.random() * 2;
  private painting = 0;
  private laser: EnergyBeam | null = null;
  private readonly strikes: StrikeField;
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly ctx: BehaviorContext;
  private readonly target: Target;
  private readonly spec: RaptureSpec;

  constructor(ctx: BehaviorContext, target: Target, spec: RaptureSpec) {
    this.ctx = ctx; this.target = target; this.spec = spec;
    this.strikes = new StrikeField(ctx);
  }

  get active(): boolean { return this.target.alive; }

  update(dt: number): void {
    const { target, ctx } = this;
    if (!target.alive) { this.stopPaint(); this.strikes.dispose(); return; }
    this.strikes.update(dt);
    if (ctx.player.hp <= 0 || target.stunned > 0) { this.stopPaint(); return; }
    const sight = clearShot(ctx, target.position, ctx.player.position)
      && flatDistance(target.position, ctx.player.position) <= this.spec.range + 5;
    if (this.laser) {
      if (!sight) { this.stopPaint(); this.cooldown = 2; return; }
      target.attackHold = .2;
      target.yaw = Math.atan2(ctx.player.position.x - target.position.x, ctx.player.position.z - target.position.z);
      this.painting += dt;
      this.emitter();
      this.to.copyFrom(ctx.player.position).addInPlaceFromFloats(0, 1, 0);
      // thin and faint at first, thickening and pulsing faster as the call comes due
      const k = this.painting / PAINT;
      const pulse = .6 + .4 * Math.sin(this.painting * (8 + 22 * k));
      this.laser.draw(this.from, this.to, .05 + .07 * k, dt, (.35 + .45 * k) * pulse);
      ctx.vfx.flashSprite(this.to, ENERGY, .3 + .4 * k, .05, .7, 'star');
      if (this.painting >= PAINT) { this.stopPaint(); this.callStrike(); }
      return;
    }
    this.cooldown -= dt;
    if (this.cooldown > 0 || target.scale < .99 || !sight) return;
    this.painting = 0;
    this.laser = new EnergyBeam(ctx.vfx);
  }

  /**
   * The laser leaves the blue X face, opposite the rocket launcher: the launcher muzzle mirrored
   * across the Cube's centre line (the model has no socket on that side).
   */
  private emitter(): void {
    const { target } = this;
    target.muzzle(this.from);
    const rx = Math.cos(target.yaw), rz = -Math.sin(target.yaw);
    const side = (this.from.x - target.position.x) * rx + (this.from.z - target.position.z) * rz;
    this.from.x -= rx * side * 2;
    this.from.z -= rz * side * 2;
  }

  private callStrike(): void {
    const p = this.ctx.player.position, angle = Math.random() * Math.PI * 2;
    this.strikes.place(p.x, p.z, STRIKE_RADIUS, STRIKE_FUSE, this.spec.damage);
    [.7, 1.4].forEach((ahead, i) => {
      const at = leadSpot(this.ctx, i + 1, ahead, angle, STRIKE_RADIUS * 1.6);
      this.strikes.place(at.x, at.z, STRIKE_RADIUS, STRIKE_FUSE + ahead * .15, this.spec.damage);
    });
    this.cooldown = COOLDOWN;
  }

  private stopPaint(): void {
    this.laser?.dispose();
    this.laser = null;
  }

  dispose(): void { this.stopPaint(); this.strikes.dispose(); }
}

export const spotter: BehaviorFactory = (ctx, target, spec) => new SpotterBehavior(ctx, target, spec);
