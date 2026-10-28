// Diver (Hanged Man): flies over cover and the crowd. It marks a red circle under the player that
// follows them for 0.8 s, with a lane showing its dive path from where it hangs, then locks in place for 1 s while it fills, then the Diver slams down
// onto it. Afterwards it's stuck in the ground for 1.5 s and takes double damage: dash out once the
// circle locks, then punish it.

import { Vector3 } from '@babylonjs/core';
import type { Target } from '../../targets';
import type { RaptureSpec } from '../roster';
import { TELL, type Tell } from '../telegraph';
import { FLARE, PLAYER_RADIUS, blastFx, flatDistance } from './common';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

const FOLLOW = .8;
const LOCK = 1;
const DIVE = .28;
const STUCK = 1.5;
const RADIUS = 2.5;

class DiverBehavior implements Behavior {
  private phase: 'ready' | 'mark' | 'dive' | 'stuck' = 'ready';
  private timer = 0;
  private cooldown = 2 + Math.random() * 2;
  private tell: Tell | null = null;
  private path: Tell | null = null;
  private readonly spot = new Vector3();
  private readonly start = new Vector3();
  private readonly eye = new Vector3();
  private readonly ctx: BehaviorContext;
  private readonly target: Target;
  private readonly spec: RaptureSpec;

  constructor(ctx: BehaviorContext, target: Target, spec: RaptureSpec) {
    this.ctx = ctx; this.target = target; this.spec = spec;
  }

  get active(): boolean { return this.target.alive; }

  update(dt: number): void {
    const { target, ctx } = this;
    if (!target.alive || ctx.player.hp <= 0) { this.reset(); return; }
    if (this.phase === 'ready') {
      this.cooldown -= dt;
      if (this.cooldown > 0 || target.scale < .99 || target.stunned > 0 || flatDistance(target.position, ctx.player.position) > this.spec.range + 5) return;
      this.phase = 'mark';
      this.timer = 0;
      this.spot.copyFrom(ctx.player.position);
      this.tell = ctx.tells.circle(this.spot.x, this.spot.z, RADIUS, TELL.area, .6);
      this.path = ctx.tells.lane(target.position.x, target.position.z, 0, 1, 1.2, TELL.charge, .5);
      this.aimPath();
      return;
    }
    target.rooted = .2;
    this.timer += dt;
    if (this.phase === 'mark') {
      if (target.stunned > 0) { this.reset(); return; }
      if (this.timer < FOLLOW) {
        this.spot.copyFrom(ctx.player.position);
        ctx.tells.moveCircle(this.tell!, this.spot.x, this.spot.z);
      } else if (this.timer - dt < FOLLOW) { this.tell!.setColor(TELL.area, 1); this.path!.setColor(TELL.charge, .9); }
      this.tell!.fill = this.path!.fill = this.timer / (FOLLOW + LOCK);
      this.aimPath();
      target.yaw = Math.atan2(this.spot.x - target.position.x, this.spot.z - target.position.z);
      ctx.vfx.flashSprite(target.muzzle(this.eye), FLARE, .4 + .4 * this.tell!.fill, .05, .9, 'star');
      if (this.timer < FOLLOW + LOCK) return;
      this.phase = 'dive';
      this.timer = 0;
      this.start.copyFrom(target.position);
      return;
    }
    if (this.phase === 'dive') {
      const t = Math.min(1, this.timer / DIVE);
      Vector3.LerpToRef(this.start, this.spot, t * t, target.position);
      target.position.y = 0;
      if (t < 1) return;
      this.release();
      blastFx(ctx, this.spot, RADIUS);
      if (flatDistance(this.spot, ctx.player.position) <= RADIUS + PLAYER_RADIUS * .5) ctx.player.takeDamage(this.spec.damage);
      for (const other of ctx.field.inRadius(this.spot, RADIUS)) if (other !== target) other.shove(other.position.subtract(this.spot).normalize().scaleInPlace(6));
      this.phase = 'stuck';
      this.timer = 0;
      target.stunned = STUCK;
      target.breaks.add('stuck', 1, STUCK);
      return;
    }
    if (this.timer >= STUCK) this.reset();
  }

  /** Stretch the path lane from the Diver to the edge of the circle. */
  private aimPath(): void {
    const { target } = this;
    const length = Math.max(.5, flatDistance(target.position, this.spot) - RADIUS);
    const yaw = Math.atan2(this.spot.x - target.position.x, this.spot.z - target.position.z);
    this.path!.setShape(1, 1.2, length);
    this.ctx.tells.moveLane(this.path!, target.position.x, target.position.z, yaw, length);
  }

  private release(): void {
    if (this.tell) this.ctx.tells.release(this.tell);
    if (this.path) this.ctx.tells.release(this.path);
    this.tell = this.path = null;
  }

  private reset(): void {
    this.release();
    this.phase = 'ready';
    this.cooldown = 4.5 + Math.random();
  }

  dispose(): void { this.release(); }
}

export const diver: BehaviorFactory = (ctx, target, spec) => new DiverBehavior(ctx, target, spec);
