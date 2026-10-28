// Spinner (Tail Bone): floats in to 8–10 m and anchors. Its spike glows for 0.8 s while a red ring
// fills around it, then it spins for 3 s throwing a three-arm spiral of slow orbs. Afterwards it's
// dizzy for 1.5 s. Kill it during the spin-up, or back off: the spiral's gaps widen with distance.

import { Vector3 } from '@babylonjs/core';
import type { Target } from '../../targets';
import type { RaptureSpec } from '../roster';
import { TELL, type Tell } from '../telegraph';
import { BoltField } from './bolts';
import { FLARE, flatDistance } from './common';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

const SPIN_UP = .8;
const SPIN = 3;
const DIZZY = 1.5;
const ARMS = 3;
/** orbs per second across all arms */
const RATE = 18;
const SWEEP = 2.2;

class SpinnerBehavior implements Behavior {
  private phase: 'ready' | 'spinUp' | 'spin' = 'ready';
  private timer = 0;
  private cooldown = 1.5 + Math.random() * 2;
  private angle = 0;
  private shotIn = 0;
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
    if (!target.alive || ctx.player.hp <= 0 || (this.phase !== 'ready' && target.stunned > 0)) { this.reset(); return; }
    if (this.phase === 'ready') {
      this.cooldown -= dt;
      if (this.cooldown > 0 || target.scale < .99 || target.stunned > 0 || flatDistance(target.position, ctx.player.position) > this.spec.range + 2) return;
      this.phase = 'spinUp';
      this.timer = SPIN_UP;
      this.tell = ctx.tells.circle(target.position.x, target.position.z, target.radius + 1, TELL.area, .8);
      return;
    }
    target.attackHold = .2;
    this.timer -= dt;
    target.muzzle(this.muzzle);
    if (this.phase === 'spinUp') {
      this.tell!.fill = 1 - this.timer / SPIN_UP;
      ctx.vfx.flashSprite(this.muzzle, FLARE, .4 + .6 * this.tell!.fill, .05, .9, 'star');
      if (this.timer > 0) return;
      this.release();
      this.phase = 'spin';
      this.timer = SPIN;
      this.angle = target.yaw;
      return;
    }
    this.angle += SWEEP * dt;
    target.yaw = this.angle * 4;
    this.shotIn -= dt;
    while (this.shotIn <= 0) {
      this.shotIn += ARMS / RATE;
      for (let arm = 0; arm < ARMS; arm++) this.bolts.fire(this.muzzle, this.angle + arm * Math.PI * 2 / ARMS, 5, this.spec.damage, { size: 1.6, range: 16 });
    }
    if (this.timer > 0) return;
    this.reset();
    target.stunned = DIZZY;
  }

  private release(): void {
    if (this.tell) this.ctx.tells.release(this.tell);
    this.tell = null;
  }

  private reset(): void {
    this.release();
    this.phase = 'ready';
    this.cooldown = 4;
    this.shotIn = 0;
  }

  dispose(): void { this.release(); this.bolts.dispose(); }
}

export const spinner: BehaviorFactory = (ctx, target, spec) => new SpinnerBehavior(ctx, target, spec);
