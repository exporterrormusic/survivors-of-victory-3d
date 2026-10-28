// Bombard (Cucumber): two arms, two jobs.
// - Right arm, three orb barrels: plants and lobs a four-shell volley, one on the player and three
//   around them, the barrels taking turns.
// - Left arm, single long cannon: a sniper shot. A thin sightline follows the
//   player for 1.4 s, then lock and brighten for 1.2 s before one heavy round.
// The two take turns, so there's always a gap to answer one before the other comes.

import { Vector3 } from '@babylonjs/core';
import type { Target } from '../../targets';
import type { RaptureSpec } from '../roster';
import { Beam } from './beam';
import { FLARE, clearShot, flatDistance } from './common';
import { MissileVolley } from './missiles';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

/** muzzles (targets.ts): 0 the left cannon, 1–3 the right arm's orb barrels */
const SNIPER = 0;
const BARRELS = [1, 2, 3];
const SHELLS = 4;
const PLANT = .8;
const GAP = 3.5;

class BombardBehavior implements Behavior {
  private next: 'volley' | 'snipe' = 'volley';
  private cooldown = 2 + Math.random() * 2;
  private plant = 0;
  private readonly volley: MissileVolley;
  private readonly sniper: Beam;
  private readonly tip = new Vector3();
  private readonly ctx: BehaviorContext;
  private readonly target: Target;
  private readonly spec: RaptureSpec;

  constructor(ctx: BehaviorContext, target: Target, spec: RaptureSpec) {
    this.ctx = ctx; this.target = target; this.spec = spec;
    this.volley = new MissileVolley(ctx);
    this.sniper = new Beam(ctx, target, {
      length: 28, width: .7, charge: 2.6, lock: 1.2, fire: .7, tick: 0, damage: Math.round(spec.damage * 1.4),
      aim: .9, track: 0, sight: true, muzzle: SNIPER, fromMuzzle: true,
    });
  }

  // shells already in the air still land after it dies
  get active(): boolean { return this.target.alive || this.volley.active; }

  update(dt: number): void {
    const { target, ctx } = this;
    this.volley.update(dt);
    if (!target.alive || ctx.player.hp <= 0 || target.stunned > 0) { this.sniper.stop(); this.plant = 0; return; }
    if (this.sniper.busy) {
      target.yaw = Math.atan2(ctx.player.position.x - target.position.x, ctx.player.position.z - target.position.z);
      this.sniper.update(dt);
      if (!this.sniper.busy) this.cooldown = GAP;
      return;
    }
    if (this.plant > 0) {
      // the orb arm winds up on the move; only the sniper arm plants
      this.plant -= dt;
      for (const b of BARRELS) ctx.vfx.flashSprite(target.muzzle(this.tip, b), FLARE, .5, .05, .8, 'star');
      if (this.plant <= 0) this.fireVolley();
      return;
    }
    this.cooldown -= dt;
    if (this.cooldown > 0 || target.scale < .99) return;
    const distance = flatDistance(target.position, ctx.player.position);
    if (this.next === 'snipe') {
      // point-blank, the long cannon can't bear: lob the orbs instead
      if (distance < 7) { this.next = 'volley'; return; }
      if (distance > 26 || !clearShot(ctx, target.position, ctx.player.position)) return;
      this.next = 'volley';
      this.sniper.start();
    } else {
      if (distance > this.spec.range + 2) return;
      this.next = 'snipe';
      this.plant = PLANT;
    }
  }

  private fireVolley(): void {
    const p = this.ctx.player.position;
    for (let i = 0; i < SHELLS; i++) {
      this.target.muzzle(this.tip, BARRELS[i % BARRELS.length]);
      const angle = Math.random() * Math.PI * 2 + i * Math.PI * 2 / (SHELLS - 1);
      const r = i === 0 ? 0 : 4;
      this.volley.fire(this.tip, p.x + Math.cos(angle) * r, p.z + Math.sin(angle) * r, {
        damage: this.spec.damage, radius: 3, flight: 1.3 + i * .08, wait: i * .15, side: i === 0 ? 0 : i % 2 ? 1 : -1,
      });
    }
    this.cooldown = GAP;
  }

  dispose(): void { this.sniper.stop(); this.volley.dispose(); }
}

export const bombard: BehaviorFactory = (ctx, target, spec) => new BombardBehavior(ctx, target, spec);
