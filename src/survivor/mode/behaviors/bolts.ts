// Straight red energy bolts shared by the skirmisher, emplacement and spinner roles: each one flies
// at chest height, hurts the player once on contact, and stops on cover. Visible travel time, so
// every bolt can be stepped around. Pooled vfx quads, since a spinner throws dozens at once.

import { Vector3 } from '@babylonjs/core';
import type { FxQuad, Rgb } from '../../vfx';
import { PLAYER_RADIUS } from './common';
import type { BehaviorContext } from './types';

const SHELL: Rgb = [2.8, .14, .22];
const CORE: Rgb = [3, 1.2, 1.15];

interface Bolt {
  readonly at: Vector3;
  readonly velocity: Vector3;
  readonly damage: number;
  readonly size: number;
  range: number;
  readonly shell: FxQuad;
  readonly core: FxQuad;
}

export class BoltField {
  private readonly bolts: Bolt[] = [];
  private readonly next = new Vector3();
  private readonly tail = new Vector3();
  private readonly ctx: BehaviorContext;

  constructor(ctx: BehaviorContext) { this.ctx = ctx; }

  get active(): boolean { return this.bolts.length > 0; }

  /** Fire from `from` along `yaw` (atan2(dx, dz)) at `speed` m/s. `size` scales the bolt and its hit radius. */
  fire(from: Vector3, yaw: number, speed: number, damage: number, { range = 18, size = 1 }: { range?: number; size?: number } = {}): void {
    const { vfx } = this.ctx;
    const shell = vfx.quad(size > 1.2 ? 'star' : 'streak', SHELL), core = vfx.quad('streak', CORE);
    vfx.glowing(shell); vfx.glowing(core);
    this.bolts.push({
      at: new Vector3(from.x, Math.max(.9, Math.min(1.4, from.y)), from.z),
      velocity: new Vector3(Math.sin(yaw) * speed, 0, Math.cos(yaw) * speed),
      damage, size, range, shell, core,
    });
  }

  update(dt: number): void {
    const { ctx } = this;
    const p = ctx.player.position;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      this.next.copyFrom(b.velocity).scaleInPlace(dt).addInPlace(b.at);
      const cover = ctx.field.navigation.traceCover(b.at, this.next, .05);
      // closest approach to the player along this step
      const dx = this.next.x - b.at.x, dz = this.next.z - b.at.z, len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p.x - b.at.x) * dx + (p.z - b.at.z) * dz) / len2));
      const hit = ctx.player.hp > 0 && Math.hypot(b.at.x + dx * t - p.x, b.at.z + dz * t - p.z) < PLAYER_RADIUS + .12 * b.size
        && (cover == null || t < cover);
      b.range -= Math.sqrt(len2);
      if (hit) ctx.player.takeDamage(b.damage);
      if (hit || cover != null || b.range <= 0) {
        if (cover != null || hit) ctx.vfx.flashSprite(hit ? p.add(new Vector3(0, 1, 0)) : this.next, SHELL, .5 * b.size, .1, .9, 'star');
        this.drop(b);
        this.bolts.splice(i, 1);
        continue;
      }
      b.at.copyFrom(this.next);
      const speed = b.velocity.length();
      this.tail.copyFrom(b.velocity).scaleInPlace(-.5 * b.size / speed).addInPlace(b.at);
      if (b.size > 1.2) ctx.vfx.sprite(b.shell, b.at, .45 * b.size);
      else ctx.vfx.streak(b.shell, this.tail, b.at, .32 * b.size);
      ctx.vfx.streak(b.core, this.tail, b.at, .1 * b.size);
    }
  }

  private drop(b: Bolt): void {
    this.ctx.vfx.release(b.shell);
    this.ctx.vfx.release(b.core);
  }

  dispose(): void {
    for (const b of this.bolts) this.drop(b);
    this.bolts.length = 0;
  }
}
