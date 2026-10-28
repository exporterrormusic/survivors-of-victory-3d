// Emplacement (Sentry): walks to within range with line of sight, then plants its legs and raises
// its dome (1.5 s, a red ring fills around it). Deployed, it hoses a stream of bolts (8/s) while
// turning toward the player at only 60°/s; every 4 s it stops for 1.2 s to vent. Out of its sight
// for 5 s, it packs up and moves. Circle it faster than it turns, or hit it while it vents.

import { Vector3 } from '@babylonjs/core';
import type { Target } from '../../targets';
import type { RaptureSpec } from '../roster';
import { TELL, type Tell } from '../telegraph';
import { BoltField } from './bolts';
import { FLARE, clearShot, flatDistance } from './common';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

const DEPLOY = 1.5;
const FIRE = 4;
const VENT = 1.2;
const RATE = 8;
const TURN = Math.PI / 3;
const PACK_UP = 5;

class EmplacementBehavior implements Behavior {
  private phase: 'move' | 'deploy' | 'fire' | 'vent' = 'move';
  private timer = 0;
  private shotIn = 0;
  private blind = 0;
  private aim = 0;
  private tell: Tell | null = null;
  private readonly bolts: BoltField;
  private readonly muzzle = new Vector3();
  private readonly ctx: BehaviorContext;
  private readonly target: Target;
  private readonly spec: RaptureSpec;

  constructor(ctx: BehaviorContext, target: Target, spec: RaptureSpec) {
    this.ctx = ctx; this.target = target; this.spec = spec;
    this.bolts = new BoltField(ctx);
  }

  get active(): boolean { return this.target.alive || this.bolts.active; }

  update(dt: number): void {
    const { target, ctx } = this;
    this.bolts.update(dt);
    if (!target.alive || ctx.player.hp <= 0) { this.pack(); return; }
    const sight = clearShot(ctx, target.position, ctx.player.position);
    const distance = flatDistance(target.position, ctx.player.position);
    if (this.phase === 'move') {
      if (target.scale < .99 || target.stunned > 0 || !sight || distance > this.spec.range + 2) return;
      this.phase = 'deploy';
      this.timer = DEPLOY;
      this.blind = 0;
      this.aim = Math.atan2(ctx.player.position.x - target.position.x, ctx.player.position.z - target.position.z);
      this.tell = ctx.tells.circle(target.position.x, target.position.z, target.radius + .6, TELL.area, .8);
      return;
    }
    // Planted: it never walks until it packs up.
    target.rooted = .2;
    if (target.stunned > 0) return;
    this.blind = sight ? 0 : this.blind + dt;
    if (this.blind >= PACK_UP) { this.pack(); return; }
    this.timer -= dt;
    if (this.phase === 'deploy') {
      this.tell!.fill = 1 - this.timer / DEPLOY;
      if (this.timer > 0) return;
      this.release();
      this.phase = 'fire';
      this.timer = FIRE;
      return;
    }
    this.turn(dt);
    if (this.phase === 'vent') {
      if (Math.random() < dt * 8) ctx.vfx.vapour(target.muzzle(this.muzzle), 1, [.9, .35, .3], .7, .8, .6);
      if (this.timer <= 0) { this.phase = 'fire'; this.timer = FIRE; }
      return;
    }
    this.shotIn -= dt;
    if (this.shotIn <= 0 && sight) {
      this.shotIn += 1 / RATE;
      const i = Math.floor(Math.random() * 2);
      target.muzzle(this.muzzle, i);
      this.bolts.fire(this.muzzle, this.aim + (Math.random() - .5) * .06, 7, this.spec.damage);
      ctx.vfx.flashSprite(this.muzzle, FLARE, .4, .06, .9, 'star');
    }
    if (this.timer <= 0) { this.phase = 'vent'; this.timer = VENT; this.shotIn = 0; }
  }

  private turn(dt: number): void {
    const { target, ctx } = this;
    const want = Math.atan2(ctx.player.position.x - target.position.x, ctx.player.position.z - target.position.z);
    const delta = Math.atan2(Math.sin(want - this.aim), Math.cos(want - this.aim));
    this.aim += Math.sign(delta) * Math.min(Math.abs(delta), TURN * dt);
    target.yaw = this.aim;
  }

  private release(): void {
    if (this.tell) this.ctx.tells.release(this.tell);
    this.tell = null;
  }

  private pack(): void {
    this.release();
    this.phase = 'move';
  }

  dispose(): void { this.release(); this.bolts.dispose(); }
}

export const emplacement: BehaviorFactory = (ctx, target, spec) => new EmplacementBehavior(ctx, target, spec);
