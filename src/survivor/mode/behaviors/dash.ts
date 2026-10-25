// Pouncer (Pelican) and Charger (Capra): lock a lane, show it, then dash down it.

import { Vector3 } from '@babylonjs/core';
import type { Target } from '../../targets';
import type { RaptureSpec } from '../roster';
import { TELL, type Tell } from '../telegraph';
import { FLARE, PLAYER_RADIUS, clearShot, flatDistance } from './common';
import type { Behavior, BehaviorContext, BehaviorFactory } from './types';

interface DashTuning {
  minRange: number;
  maxRange: number;
  windup: number;
  speed: number;
  maxLength: number;
  /** keep going this far past where the player stood */
  overshoot: number;
  width: number;
  recover: number;
  cooldown: number;
  /** stunned for this long if it runs into a wall (Capra) */
  wallStun: number;
  /** damage to Raptures it runs through (Capra tramples) */
  trample: number;
}

const POUNCE: DashTuning = { minRange: 2, maxRange: 6.5, windup: .5, speed: 14, maxLength: 7, overshoot: 1.5, width: 1.6, recover: .8, cooldown: 2.4, wallStun: 0, trample: 0 };
const CHARGE: DashTuning = { minRange: 7, maxRange: 15, windup: .9, speed: 12, maxLength: 18, overshoot: 4, width: 2.2, recover: 1, cooldown: 4, wallStun: 2.5, trample: 20 };

class DashBehavior implements Behavior {
  private phase: 'ready' | 'windup' | 'dash' | 'recover' = 'ready';
  private timer: number;
  private tell: Tell | null = null;
  private yaw = 0;
  private length = 0;
  private travelled = 0;
  private hitPlayer = false;
  private readonly trampled = new Set<Target>();
  private readonly ctx: BehaviorContext;
  private readonly target: Target;
  private readonly damage: number;
  private readonly tuning: DashTuning;

  constructor(ctx: BehaviorContext, target: Target, spec: RaptureSpec, tuning: DashTuning) {
    this.ctx = ctx; this.target = target; this.damage = spec.damage; this.tuning = tuning;
    this.timer = 1 + Math.random() * tuning.cooldown;
  }

  get active(): boolean { return this.target.alive; }

  update(dt: number): void {
    const { target, ctx, tuning } = this;
    if (!target.alive || ctx.player.hp <= 0) { this.reset(); return; }
    if (target.stunned > 0 && this.phase !== 'recover') { this.reset(); return; }
    this.timer -= dt;
    const player = ctx.player.position;
    switch (this.phase) {
      case 'ready': {
        if (this.timer > 0 || target.scale < .99) return;
        const distance = flatDistance(target.position, player);
        if (distance < tuning.minRange || distance > tuning.maxRange || !clearShot(ctx, target.position, player)) return;
        this.yaw = Math.atan2(player.x - target.position.x, player.z - target.position.z);
        this.length = Math.min(tuning.maxLength, distance + tuning.overshoot);
        target.yaw = this.yaw;
        this.tell = ctx.tells.lane(target.position.x, target.position.z, this.yaw, this.length, tuning.width, TELL.charge);
        this.phase = 'windup';
        this.timer = tuning.windup;
        target.attackHold = tuning.windup + .1;
        return;
      }
      case 'windup':
        target.attackHold = Math.max(target.attackHold, .1);
        this.tell!.fill = 1 - Math.max(0, this.timer) / tuning.windup;
        if (this.timer <= 0) { this.phase = 'dash'; this.travelled = 0; this.hitPlayer = false; this.trampled.clear(); }
        return;
      case 'dash': {
        target.attackHold = .1;
        const step = Math.min(tuning.speed * dt, this.length - this.travelled);
        const nx = target.position.x + Math.sin(this.yaw) * step, nz = target.position.z + Math.cos(this.yaw) * step;
        const wall = Math.hypot(nx, nz) > ctx.arenaRadius - target.radius
          || (ctx.snow?.enabled === true && !ctx.snow.canOccupy(nx, nz, target.radius * .6));
        if (!wall) { target.position.x = nx; target.position.z = nz; this.travelled += step; }
        if (!this.hitPlayer && flatDistance(target.position, player) <= target.radius + PLAYER_RADIUS + .15) {
          ctx.player.takeDamage(this.damage);
          this.hitPlayer = true;
        }
        if (tuning.trample > 0) {
          for (const other of ctx.field.inRadius(target.position, target.radius * .8)) {
            if (other === target || this.trampled.has(other)) continue;
            this.trampled.add(other);
            ctx.run.damage(other, tuning.trample, 'effect');
          }
        }
        if (wall && tuning.wallStun > 0) {
          target.stunned = tuning.wallStun;
          ctx.vfx.flashSprite(target.position.add(new Vector3(0, 1, 0)), FLARE, 1.4, .25, .9, 'star');
        }
        if (wall || this.travelled >= this.length - 1e-6) {
          this.releaseTell();
          this.phase = 'recover';
          this.timer = wall && tuning.wallStun > 0 ? tuning.wallStun : tuning.recover;
          target.attackHold = this.timer;
        }
        return;
      }
      case 'recover':
        if (this.timer <= 0) { this.phase = 'ready'; this.timer = tuning.cooldown; }
    }
  }

  private releaseTell(): void {
    if (this.tell) this.ctx.tells.release(this.tell);
    this.tell = null;
  }

  private reset(): void {
    this.releaseTell();
    if (this.phase !== 'ready') { this.phase = 'ready'; this.timer = this.tuning.cooldown; }
  }

  dispose(): void { this.releaseTell(); }
}

export const pouncer: BehaviorFactory = (ctx, target, spec) => new DashBehavior(ctx, target, spec, POUNCE);
export const charger: BehaviorFactory = (ctx, target, spec) => new DashBehavior(ctx, target, spec, CHARGE);
