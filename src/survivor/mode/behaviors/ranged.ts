// Ranged roles built on the shared missile and beam pieces (after the Phaser build):
// - Mortar (Phalanx): plants for half a second, lobs three comets: one on the player, two where
//   they're heading. Changing direction beats the prediction.
// - Sniper (Seahorse): its eye charges and a thin sightline follows the player for 1.4 s, then the
//   lane locks and brightens for 1.2 s before one heavy shot. Sidestep once it locks.

import { Vector3 } from '@babylonjs/core';
import type { Target } from '../../targets';
import type { RaptureSpec } from '../roster';
import { Beam, type BeamTuning } from './beam';
import { FLARE, clearShot, flatDistance, leadSpot } from './common';
import { MissileVolley } from './missiles';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

interface ArtilleryTuning {
  readonly shells: number;
  readonly cooldown: number;
  readonly plant: number;
  readonly radius: number;
  /** spread of the extra shells around the player, metres */
  readonly spread: number;
  /** extra shells land along the player's movement (this many seconds ahead per shell) instead of around them */
  readonly lead?: number;
}

class ArtilleryBehavior implements Behavior {
  private cooldown: number;
  private plant = 0;
  private leadAngle = 0;
  private readonly volley: MissileVolley;
  private readonly muzzle = new Vector3();
  private readonly ctx: BehaviorContext;
  private readonly target: Target;
  private readonly spec: RaptureSpec;
  private readonly tuning: ArtilleryTuning;

  constructor(ctx: BehaviorContext, target: Target, spec: RaptureSpec, tuning: ArtilleryTuning) {
    this.ctx = ctx; this.target = target; this.spec = spec; this.tuning = tuning;
    this.volley = new MissileVolley(ctx);
    this.cooldown = 1.5 + Math.random() * tuning.cooldown * .5;
  }

  // Shells already in the air still land after it dies.
  get active(): boolean { return this.target.alive || this.volley.active; }

  update(dt: number): void {
    this.volley.update(dt);
    const { target, ctx, tuning } = this;
    if (!target.alive || ctx.player.hp <= 0 || target.scale < .99 || target.stunned > 0) { this.plant = 0; return; }
    if (this.plant > 0) {
      // winds up on the move
      this.plant -= dt;
      ctx.vfx.flashSprite(target.muzzle(this.muzzle), FLARE, .5, .05, .8, 'star');
      if (this.plant <= 0) this.fire();
      return;
    }
    this.cooldown -= dt;
    if (this.cooldown > 0 || flatDistance(target.position, ctx.player.position) > this.spec.range + 2) return;
    this.plant = tuning.plant;
  }

  private fire(): void {
    const { ctx, tuning } = this;
    const p = ctx.player.position;
    this.target.muzzle(this.muzzle);
    this.leadAngle = Math.random() * Math.PI * 2;
    for (let i = 0; i < tuning.shells; i++) {
      if (tuning.lead && i > 0) {
        // Predicted: further along the player's path for each shell. Standing still stacks them.
        const at = leadSpot(ctx, i, tuning.lead * i, this.leadAngle, tuning.radius * 1.6);
        this.volley.fire(this.muzzle, at.x, at.z, {
          damage: this.spec.damage, radius: tuning.radius, flight: 1.4, wait: i * .12, side: i % 2 ? 1 : -1,
        });
        continue;
      }
      const angle = Math.random() * Math.PI * 2 + i * Math.PI * 2 / Math.max(1, tuning.shells - 1);
      const r = i === 0 ? 0 : tuning.spread;
      this.volley.fire(this.muzzle, p.x + Math.cos(angle) * r, p.z + Math.sin(angle) * r, {
        damage: this.spec.damage, radius: tuning.radius, flight: 1.3 + i * .08, wait: i * .15, side: i === 0 ? 0 : i % 2 ? 1 : -1,
      });
    }
    this.cooldown = tuning.cooldown;
  }

  dispose(): void { this.volley.dispose(); }
}

class BeamBehavior implements Behavior {
  private cooldown: number;
  private readonly beam: Beam;
  private readonly ctx: BehaviorContext;
  private readonly target: Target;
  private readonly reach: number;
  private readonly every: number;

  constructor(ctx: BehaviorContext, target: Target, tuning: BeamTuning, reach: number, every: number) {
    this.ctx = ctx; this.target = target; this.reach = reach; this.every = every;
    this.beam = new Beam(ctx, target, tuning);
    this.cooldown = 1 + Math.random() * every * .5;
  }

  get active(): boolean { return this.target.alive; }

  update(dt: number): void {
    const { target, ctx } = this;
    if (!target.alive || ctx.player.hp <= 0) { this.beam.stop(); return; }
    if (this.beam.busy) { this.beam.update(dt); if (!this.beam.busy) this.cooldown = this.every; return; }
    this.cooldown -= dt;
    if (this.cooldown > 0 || target.scale < .99 || target.stunned > 0) return;
    if (flatDistance(target.position, ctx.player.position) > this.reach || !clearShot(ctx, target.position, ctx.player.position)) return;
    this.beam.start();
  }

  dispose(): void { this.beam.stop(); }
}

export const mortar: BehaviorFactory = (ctx, target, spec) =>
  new ArtilleryBehavior(ctx, target, spec, { shells: 3, cooldown: 4.5, plant: .5, radius: 2.5, spread: 0, lead: .7 });

export const sniper: BehaviorFactory = (ctx, target, spec) => new BeamBehavior(ctx, target, {
  length: spec.range + 4, width: .6, charge: 2.6, lock: 1.2, fire: .7, tick: 0, damage: spec.damage, aim: .9, track: 0,
  sight: true,
}, spec.range, 5);
