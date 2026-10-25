// Swarmer (Lure): runs in, its eye pods flare for 0.35 s, then a short-range zap.

import { Vector3 } from '@babylonjs/core';
import type { Target } from '../../targets';
import type { FxQuad } from '../../vfx';
import type { RaptureSpec } from '../roster';
import { FLARE, PLAYER_RADIUS, flatDistance } from './common';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

class SwarmerBehavior implements Behavior {
  private flare: FxQuad | null = null;
  private timer = 0;
  private cooldown = Math.random() * .5;
  private readonly at = new Vector3();
  private readonly ctx: BehaviorContext;
  private readonly target: Target;
  private readonly damage: number;

  constructor(ctx: BehaviorContext, target: Target, spec: RaptureSpec) {
    this.ctx = ctx; this.target = target; this.damage = spec.damage;
  }

  get active(): boolean { return this.target.alive; }

  update(dt: number): void {
    const { target, ctx } = this;
    if (!target.alive || ctx.player.hp <= 0) { this.stop(); return; }
    this.cooldown = Math.max(0, this.cooldown - dt);
    const reach = target.radius + PLAYER_RADIUS + .9;
    if (!this.flare) {
      if (this.cooldown > 0 || target.scale < .99 || target.stunned > 0 || flatDistance(target.position, ctx.player.position) > reach) return;
      this.flare = ctx.vfx.quad('star', FLARE);
      ctx.vfx.glowing(this.flare);
      this.timer = .35;
      target.attackHold = .45;
    }
    this.timer -= dt;
    ctx.vfx.sprite(this.flare, target.muzzle(this.at), .5 + .4 * (1 - this.timer / .35));
    if (this.timer > 0) return;
    if (flatDistance(target.position, ctx.player.position) <= reach + .2) ctx.player.takeDamage(this.damage);
    ctx.vfx.flashSprite(this.at, FLARE, .8, .12, .9, 'star');
    this.stop();
    this.cooldown = .9;
  }

  private stop(): void {
    if (this.flare) this.ctx.vfx.release(this.flare);
    this.flare = null;
  }

  dispose(): void { this.stop(); }
}

export const swarmer: BehaviorFactory = (ctx, target, spec) => new SwarmerBehavior(ctx, target, spec);
