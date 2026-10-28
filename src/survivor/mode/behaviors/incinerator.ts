// Incinerator (Thermite): everything comes out of its four huge cannons.
// - Inferno fan: all four cannons charge (glowing at the tips), lock for 1 s, then each pours a
//   burning beam for 2 s: two converge on the player line, two flare out, with gaps between.
//   Step into a gap or back out of reach.
// - Napalm salvo: between fans, the cannons lob a shell each in turn: one on the player, the
//   rest where they're heading.

import { Vector3 } from '@babylonjs/core';
import type { Target } from '../../targets';
import type { RaptureSpec } from '../roster';
import { Beam } from './beam';
import { clearShot, flatDistance, leadSpot } from './common';
import { MissileVolley } from './missiles';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

/** the four cannon tips (socket_muzzle_fire_01–04) */
const CANNONS = [0, 1, 2, 3];
/**
 * Fan angles by cannon, leftmost to rightmost (rad off the player line). The cannons sit as two
 * stacked pairs ~1.7 m either side of centre, so each pair's inner cannon angles in to cover the
 * player line and its outer one angles out: the gaps fall between them, not dead ahead.
 */
const FAN = [-.38, .1, -.1, .38];
const FAN_EVERY = 7;
const SALVO_EVERY = 4.5;

class IncineratorBehavior implements Behavior {
  private fanIn = 2 + Math.random() * 2;
  private salvoIn = 4;
  private aimYaw = 0;
  private readonly beams: Beam[];
  private readonly shells: MissileVolley;
  private readonly tip = new Vector3();
  private readonly ctx: BehaviorContext;
  private readonly target: Target;
  private readonly spec: RaptureSpec;

  constructor(ctx: BehaviorContext, target: Target, spec: RaptureSpec) {
    this.ctx = ctx; this.target = target; this.spec = spec;
    this.shells = new MissileVolley(ctx);
    this.beams = CANNONS.map((muzzle) => new Beam(ctx, target, {
      length: 10, width: 1.3, charge: 1.8, lock: 1, fire: 2, tick: .25, damage: Math.round(spec.damage * .75),
      aim: 0, track: 0, muzzle, fromMuzzle: true,
    }));
  }

  get active(): boolean { return this.target.alive || this.shells.active; }

  update(dt: number): void {
    const { target, ctx } = this;
    this.shells.update(dt);
    if (!target.alive || ctx.player.hp <= 0) { this.stop(); return; }
    if (this.beams[0].busy) {
      target.yaw = this.aimYaw;
      for (const beam of this.beams) beam.update(dt);
      if (!this.beams[0].busy) this.fanIn = FAN_EVERY;
      return;
    }
    if (target.scale < .99 || target.stunned > 0) return;
    const distance = flatDistance(target.position, ctx.player.position);
    this.fanIn -= dt;
    this.salvoIn -= dt;
    if (this.fanIn <= 0 && distance < 9 && clearShot(ctx, target.position, ctx.player.position)) { this.fan(); return; }
    if (this.salvoIn <= 0 && distance < 20) this.salvo();
  }

  private fan(): void {
    const { target, ctx } = this;
    this.aimYaw = target.yaw = Math.atan2(ctx.player.position.x - target.position.x, ctx.player.position.z - target.position.z);
    // Give the leftmost cannon the leftmost angle, and so on, so the lanes never cross.
    const rx = Math.cos(this.aimYaw), rz = -Math.sin(this.aimYaw);
    const order = CANNONS.map((i) => {
      target.muzzle(this.tip, i);
      return { i, side: (this.tip.x - target.position.x) * rx + (this.tip.z - target.position.z) * rz };
    }).sort((a, b) => a.side - b.side);
    order.forEach(({ i }, rank) => this.beams[i].start(FAN[rank]));
  }

  private salvo(): void {
    const p = this.ctx.player.position, angle = Math.random() * Math.PI * 2;
    CANNONS.forEach((muzzle, i) => {
      this.target.muzzle(this.tip, muzzle);
      const at = i === 0 ? { x: p.x, z: p.z } : leadSpot(this.ctx, i, i * .5, angle, 3.2);
      this.shells.fire(this.tip, at.x, at.z, {
        damage: Math.round(this.spec.damage * .75), radius: 2, flight: 1.4, wait: i * .2, side: i % 2 ? 1 : -1, size: .7,
      });
    });
    this.salvoIn = SALVO_EVERY;
  }

  private stop(): void { for (const beam of this.beams) beam.stop(); }

  dispose(): void { this.stop(); this.shells.dispose(); }
}

export const incinerator: BehaviorFactory = (ctx, target, spec) => new IncineratorBehavior(ctx, target, spec);
