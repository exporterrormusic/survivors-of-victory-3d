// Gunship (Penetrator): flies strafing runs. It picks a line through the player and shows a 2.5 m
// wide red lane, fixed from the start (1.4 s), then flies down it at 12 m/s raking the lane with
// cannon fire: it hits the player once if they're still in the lane.
// Then it banks round for 2 s, broadside on, taking +50% damage. Step out, then shoot it.

import { Vector3 } from '@babylonjs/core';
import type { Target } from '../../targets';
import type { RaptureSpec } from '../roster';
import { TELL, type Tell } from '../telegraph';
import { BLAST, FLARE, PLAYER_RADIUS, flatDistance } from './common';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

const WARN = 1.4;
const SPEED = 12;
const WIDTH = 2.5;
const OVERSHOOT = 9;
const BANK = 2;

class GunshipBehavior implements Behavior {
  private phase: 'ready' | 'warn' | 'run' | 'bank' = 'ready';
  private timer = 0;
  private cooldown = 2 + Math.random() * 2;
  private yaw = 0;
  private length = 0;
  private travelled = 0;
  private hitPlayer = false;
  private gunIn = 0;
  private barrel = 0;
  private tell: Tell | null = null;
  private readonly start = new Vector3();
  private readonly muzzle = new Vector3();
  private readonly ctx: BehaviorContext;
  private readonly target: Target;
  private readonly spec: RaptureSpec;

  constructor(ctx: BehaviorContext, target: Target, spec: RaptureSpec) {
    this.ctx = ctx; this.target = target; this.spec = spec;
  }

  get active(): boolean { return this.target.alive; }

  update(dt: number): void {
    const { target, ctx } = this;
    if (!target.alive || ctx.player.hp <= 0 || (target.stunned > 0 && this.phase !== 'ready')) { this.reset(); return; }
    if (this.phase === 'ready') {
      this.cooldown -= dt;
      const distance = flatDistance(target.position, ctx.player.position);
      if (this.cooldown > 0 || target.scale < .99 || target.stunned > 0 || distance > this.spec.range + 6) return;
      this.phase = 'warn';
      this.timer = WARN;
      this.start.copyFrom(target.position);
      this.yaw = Math.atan2(ctx.player.position.x - target.position.x, ctx.player.position.z - target.position.z);
      // through the player and out the far side, kept inside the arena
      this.length = this.clampToArena(distance + OVERSHOOT);
      this.tell = ctx.tells.lane(this.start.x, this.start.z, this.yaw, this.length, WIDTH, TELL.charge, .6);
      target.yaw = this.yaw;
      return;
    }
    target.attackHold = .2;
    this.timer -= dt;
    if (this.phase === 'warn') {
      this.tell!.fill = 1 - this.timer / WARN;
      if (this.timer <= .6 && this.timer + dt > .6) this.tell!.setColor(TELL.charge, 1);
      if (this.timer > 0) return;
      this.phase = 'run';
      this.travelled = 0;
      this.hitPlayer = false;
      return;
    }
    if (this.phase === 'run') {
      this.travelled = Math.min(this.length, this.travelled + SPEED * dt);
      target.position.set(this.start.x + Math.sin(this.yaw) * this.travelled, target.position.y, this.start.z + Math.cos(this.yaw) * this.travelled);
      target.yaw = this.yaw;
      this.rake(dt);
      if (!this.hitPlayer && flatDistance(target.position, ctx.player.position) <= WIDTH / 2 + PLAYER_RADIUS) {
        this.hitPlayer = true;
        ctx.player.takeDamage(this.spec.damage);
      }
      if (this.travelled < this.length) return;
      this.release();
      this.phase = 'bank';
      this.timer = BANK;
      target.breaks.add('broadside', .5, BANK);
      return;
    }
    // banking: a slow turn back toward the player, broadside on
    target.yaw += dt * Math.PI / BANK;
    if (this.timer <= 0) this.reset();
  }

  /** Cannon tracers from alternating barrels into the ground just ahead, kicking up sparks. */
  private rake(dt: number): void {
    const { target, ctx } = this;
    this.gunIn -= dt;
    while (this.gunIn <= 0) {
      this.gunIn += .05;
      const barrel = this.barrel++ % 4;
      target.muzzle(this.muzzle, barrel);
      const ahead = 2.5 + Math.random() * 2, across = (Math.random() - .5) * WIDTH;
      const hit = new Vector3(target.position.x + Math.sin(this.yaw) * ahead + Math.cos(this.yaw) * across, .05,
        target.position.z + Math.cos(this.yaw) * ahead - Math.sin(this.yaw) * across);
      tracer(ctx, this.muzzle.clone(), hit);
      ctx.vfx.flashSprite(this.muzzle, FLARE, .35, .04, 1, 'star');
      ctx.vfx.sparks(hit, 3, BLAST, FLARE, 4);
    }
  }

  private clampToArena(length: number): number {
    const r = this.ctx.arenaRadius - 2;
    if (!(r > 0)) return length;
    const sx = this.start.x, sz = this.start.z, dx = Math.sin(this.yaw), dz = Math.cos(this.yaw);
    // farthest t with |start + dir·t| <= r
    const b = sx * dx + sz * dz, c = sx * sx + sz * sz - r * r, disc = b * b - c;
    return disc > 0 ? Math.max(4, Math.min(length, -b + Math.sqrt(disc))) : length;
  }

  private release(): void {
    if (this.tell) this.ctx.tells.release(this.tell);
    this.tell = null;
  }

  private reset(): void {
    this.release();
    this.phase = 'ready';
    this.cooldown = 4 + Math.random() * 2;
  }

  dispose(): void { this.release(); }
}

/** One red cannon tracer, gone in a few frames. */
function tracer(ctx: BehaviorContext, from: Vector3, to: Vector3): void {
  const shell = ctx.vfx.quad('streak', [3, .15, .2]);
  ctx.vfx.glowing(shell);
  const tail = new Vector3();
  ctx.vfx.add({
    update: (_dt, age) => {
      if (age >= .07) return false;
      Vector3.LerpToRef(from, to, Math.min(1, age / .07 + .3), tail);
      ctx.vfx.streak(shell, from, tail, .12);
      return true;
    },
    dispose: () => ctx.vfx.release(shell),
  });
}

export const gunship: BehaviorFactory = (ctx, target, spec) => new GunshipBehavior(ctx, target, spec);
