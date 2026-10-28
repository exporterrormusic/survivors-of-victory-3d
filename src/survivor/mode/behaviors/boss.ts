// Boss (Obelisk) on three clocks, after the Phaser build's Titan: strike circles under the
// player, a missile volley and twin charged beams, every attack split across its two muzzles.
// Below half HP every clock runs faster and the strikes come in threes. The standard bolt (one
// from each muzzle) fills the gaps.

import { Vector3 } from '@babylonjs/core';
import { EnemyLaserAttack } from '../../enemy-attack';
import type { Target } from '../../targets';
import type { RaptureSpec } from '../roster';
import { Beam } from './beam';
import { flatDistance } from './common';
import { MissileVolley } from './missiles';
import { StrikeField } from './strikes';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

const STRIKE_FUSE = 1.6;
const STRIKE_RADIUS = 3;

class BossBehavior implements Behavior {
  private strikeIn = 4;
  private volleyIn = 8;
  private beamIn = 12;
  private readonly strikes: StrikeField;
  private readonly volley: MissileVolley;
  /** one beam from each of its two muzzles */
  private readonly beams: Beam[];
  private readonly bolt: EnemyLaserAttack;
  private readonly muzzle = new Vector3();
  private readonly ctx: BehaviorContext;
  private readonly target: Target;
  private readonly spec: RaptureSpec;

  constructor(ctx: BehaviorContext, target: Target, spec: RaptureSpec) {
    this.ctx = ctx; this.target = target; this.spec = spec;
    this.volley = new MissileVolley(ctx);
    this.strikes = new StrikeField(ctx);
    this.beams = [0, 1].map((muzzle) => new Beam(ctx, target, {
      length: 22, width: 2.2, charge: 1.4, fire: 2, tick: .2, damage: Math.round(spec.damage * .25), aim: 1.2, lock: .6, track: .35,
      muzzle, fromMuzzle: true,
    }));
    this.bolt = new EnemyLaserAttack({ vfx: ctx.vfx, snow: ctx.snow, targets: ctx.field }, target, ctx.player, 2, ctx.pacing, 2);
  }

  get active(): boolean { return this.target.alive || this.strikes.active || this.volley.active; }

  update(dt: number): void {
    const { target, ctx } = this;
    this.volley.update(dt);
    this.strikes.update(dt);
    if (!target.alive) { for (const beam of this.beams) beam.stop(); return; }
    if (ctx.player.hp <= 0 || target.scale < .99) return;
    if (this.beams[0].busy) {
      // muzzle-mounted beams leave the facing to us: keep the body on the player
      target.yaw = Math.atan2(ctx.player.position.x - target.position.x, ctx.player.position.z - target.position.z);
      for (const beam of this.beams) beam.update(dt);
      return;
    }
    const enraged = target.hp < target.maxHp * .5;
    const rate = enraged ? 1.6 : 1;
    this.strikeIn -= dt * rate; this.volleyIn -= dt * rate; this.beamIn -= dt * rate;
    if (this.beamIn <= 0 && flatDistance(target.position, ctx.player.position) < 20) {
      this.beamIn = 12;
      for (const beam of this.beams) beam.start();
      return;
    }
    if (this.strikeIn <= 0) { this.strikeIn = 7; this.placeStrikes(enraged ? 3 : 1); }
    if (this.volleyIn <= 0) { this.volleyIn = 10; this.fireVolley(); }
    this.bolt.update(dt);
  }

  private placeStrikes(count: number): void {
    const p = this.ctx.player.position;
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / 3, r = i === 0 ? 0 : 5;
      this.strikes.place(p.x + Math.cos(angle) * r, p.z + Math.sin(angle) * r, STRIKE_RADIUS, STRIKE_FUSE, 12);
    }
  }

  private fireVolley(): void {
    const p = this.ctx.player.position;
    for (let i = 0; i < 4; i++) {
      this.target.muzzle(this.muzzle, i % 2);
      const angle = Math.random() * Math.PI * 2;
      const r = i === 0 ? 0 : 2.5 + Math.random() * 3;
      this.volley.fire(this.muzzle, p.x + Math.cos(angle) * r, p.z + Math.sin(angle) * r, {
        damage: Math.round(this.spec.damage * .7), radius: 2.5, flight: 1.5, wait: i * .15, side: i % 2 ? 1 : -1,
      });
    }
  }

  dispose(): void {
    this.strikes.dispose();
    this.volley.dispose();
    for (const beam of this.beams) beam.stop();
    this.bolt.dispose();
  }
}

export const boss: BehaviorFactory = (ctx, target, spec) => new BossBehavior(ctx, target, spec);
